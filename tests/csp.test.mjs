// lib/csp.js and middleware.js — the per-request, nonce-based policy.
//
// What these pin is the shape of the policy and that the nonce reaches the two
// places that need it server-side (Next and Clerk read it from the REQUEST
// headers). Whether a real browser then runs the page cleanly under it is a
// separate check, against a production build.

import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { buildContentSecurityPolicy, createNonce, cspHeaderName } from "../lib/csp.js";

globalThis.__KC_TEST__ = { userId: null, roles: {}, cookies: {} };

const savedKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const savedMode = process.env.CSP_REPORT_ONLY;
afterEach(() => {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = savedKey ?? "";
  if (savedMode === undefined) delete process.env.CSP_REPORT_ONLY;
  else process.env.CSP_REPORT_ONLY = savedMode;
});

function directive(policy, name) {
  const found = policy.split("; ").find((d) => d.startsWith(`${name} `));
  return found ? found.split(" ").slice(1) : null;
}

const clerkKey = (host) => `pk_live_${Buffer.from(`${host}$`).toString("base64")}`;

test("scripts are allowed by nonce, with no inline or eval allowance in production", () => {
  const scripts = directive(buildContentSecurityPolicy("abc123"), "script-src");

  assert.ok(scripts.includes("'nonce-abc123'"));
  assert.ok(scripts.includes("'strict-dynamic'"));
  assert.ok(!scripts.includes("'unsafe-inline'"), "the nonce replaces it");
  assert.ok(!scripts.includes("'unsafe-eval'"));
});

test("development adds only what the dev server needs", () => {
  const policy = buildContentSecurityPolicy("abc123", { dev: true });
  assert.ok(directive(policy, "script-src").includes("'unsafe-eval'"), "React Refresh");
  assert.ok(directive(policy, "connect-src").includes("ws:"), "hot reload socket");
  assert.ok(!directive(policy, "script-src").includes("'unsafe-inline'"));
});

test("Clerk's Frontend API host comes from the publishable key", () => {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = clerkKey("clerk.kastochha.com");
  const policy = buildContentSecurityPolicy("n");

  assert.ok(directive(policy, "connect-src").includes("https://clerk.kastochha.com"));
  assert.ok(directive(policy, "script-src").includes("https://clerk.kastochha.com"));
  assert.ok(!policy.includes("clerk.accounts.dev"), "no leftover dev-instance wildcard");
});

test("a missing or malformed key leaves Clerk out rather than writing junk", () => {
  for (const key of ["", "not-a-key", `pk_live_${Buffer.from("evil.com; script-src *$").toString("base64")}`]) {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = key;
    const policy = buildContentSecurityPolicy("n");
    assert.ok(!policy.includes("null") && !policy.includes("undefined"), key);
    assert.equal(policy.match(/script-src/g).length, 1, `no injected directive for ${key}`);
  }
});

test("the lockdown directives are all present", () => {
  const policy = buildContentSecurityPolicy("n");
  assert.deepEqual(directive(policy, "object-src"), ["'none'"]);
  assert.deepEqual(directive(policy, "base-uri"), ["'self'"]);
  assert.deepEqual(directive(policy, "frame-ancestors"), ["'self'"]);
  assert.deepEqual(directive(policy, "form-action"), ["'self'"]);
  assert.ok(directive(policy, "frame-src").includes("https://www.youtube-nocookie.com"), "embeds");
  const connect = directive(policy, "connect-src");
  assert.ok(connect.includes("https://*.google-analytics.com"), "analytics");
  assert.ok(connect.includes("https://analytics.google.com"), "GA4's collect host, which the wildcard misses");
});

test("nonces are 128 random bits and never repeat", () => {
  const seen = new Set(Array.from({ length: 200 }, () => createNonce()));
  assert.equal(seen.size, 200);
  for (const nonce of seen) assert.equal(Buffer.from(nonce, "base64").length, 16);
});

test("enforcing unless explicitly switched to report-only", () => {
  delete process.env.CSP_REPORT_ONLY;
  assert.equal(cspHeaderName(), "Content-Security-Policy");
  process.env.CSP_REPORT_ONLY = "true";
  assert.equal(cspHeaderName(), "Content-Security-Policy-Report-Only");
});

test("middleware puts the nonce on the response and on the request Next renders", async () => {
  const { default: middleware } = await import("../middleware.js");
  const { NextRequest } = await import("next/server");

  const request = new NextRequest("https://kastochha.com/discussions", {
    // A client-supplied nonce must not survive.
    headers: { "x-nonce": "attacker-chosen" }
  });
  const response = await middleware(request, {});

  const policy = response.headers.get("content-security-policy");
  const nonce = response.headers.get("x-middleware-request-x-nonce");
  assert.ok(nonce && nonce !== "attacker-chosen");
  assert.ok(policy.includes(`'nonce-${nonce}'`), "the browser gets the same nonce");
  assert.equal(
    response.headers.get("x-middleware-request-content-security-policy"),
    policy,
    "Next reads the nonce from the request's CSP header while rendering"
  );
  assert.match(response.headers.get("x-middleware-override-headers"), /x-nonce/);

  const second = await middleware(new NextRequest("https://kastochha.com/"), {});
  assert.notEqual(second.headers.get("x-middleware-request-x-nonce"), nonce, "fresh per request");
});

test("API responses get no document policy", async () => {
  const { default: middleware } = await import("../middleware.js");
  const { NextRequest } = await import("next/server");

  const response = await middleware(new NextRequest("https://kastochha.com/api/votes/trending"), {});
  assert.equal(response.headers.get("content-security-policy"), null);
  assert.equal(response.headers.get("x-middleware-request-x-nonce"), null);
});
