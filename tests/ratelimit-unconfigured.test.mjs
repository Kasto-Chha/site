// lib/ratelimit.js with no Upstash credentials, in its own process — the
// module decides once at import whether to build a limiter at all, so this
// cannot share a process with the configured tests.

import test from "node:test";
import assert from "node:assert/strict";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { checkRateLimit, retryAfterSeconds } = await import("../lib/ratelimit.js");

test("without Upstash credentials every check passes, flagged as skipped", async () => {
  for (let i = 0; i < 50; i += 1) {
    const result = await checkRateLimit("chat", "anon:203.0.113.1");
    assert.deepEqual(result, { ok: true, skipped: true });
  }
});

test("retryAfterSeconds is always at least a second", () => {
  assert.equal(retryAfterSeconds(undefined), 60);
  assert.equal(retryAfterSeconds(Date.now() - 10_000), 1, "a past reset never goes negative");
  assert.ok(retryAfterSeconds(Date.now() + 30_000) >= 29);
});
