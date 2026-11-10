// Patch 11b: the dashboard and sign-in polish. Each test is tied to a finding from the Stage A test.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const { signInUrl } = await import("../lib/signInUrl.js");

// ---------- item 6: the top bar's Sign in brings you back to the page you were on (check J11) ----------

test("Sign in carries the page you are on, so signing in brings you back to it", () => {
  assert.equal(signInUrl("/discussions/ram-cafe-test"), "/sign-in?redirect_url=%2Fdiscussions%2Fram-cafe-test");
  assert.equal(signInUrl("/featured/some-article"), "/sign-in?redirect_url=%2Ffeatured%2Fsome-article");
  assert.equal(signInUrl("/discussions"), "/sign-in?redirect_url=%2Fdiscussions");
});

test("on the home page and the sign-in pages it is the plain sign-in page, and nothing off this site is ever passed on", () => {
  for (const path of ["/", "/sign-in", "/sign-in/factor-one", "/sign-up", "/sign-up/verify", "", null, undefined, 5]) assert.equal(signInUrl(path), "/sign-in", String(path));
  for (const bad of ["//evil.com/x", "https://evil.com", "http://evil.com/a", "/\\evil.com", "javascript:alert(1)", "evil.com/a", "/a b", "/" + "a".repeat(400)]) assert.equal(signInUrl(bad), "/sign-in", bad);
  assert.equal(signInUrl("/hub/zz-test-cafe"), "/sign-in?redirect_url=%2Fhub%2Fzz-test-cafe");
});

test("the top bar uses it, and the sign-in page still honours a return address", () => {
  assert.match(read("app/components/NavAuth.js"), /<Link href=\{signInUrl\(pathname\)\} className="btn-outline">Sign in<\/Link>/);
  assert.match(read("app/sign-in/[[...sign-in]]/page.js"), /fallbackRedirectUrl="\/"/, "the fallback only applies when no redirect_url is given");
});

// ---------- item 5: the Google card warns about an earlier review ----------

test("the Google card says Google keeps one review per person for each place, so nobody is surprised by their earlier one", () => {
  const card = read("app/discussions/[slug]/GoogleCopyCard.js");
  assert.match(card, /Google keeps one review per person for each place\./);
  assert.match(card, /Google will open your\s+earlier review for editing instead of a new one\./);
  assert.ok(card.indexOf("Google keeps one review") < card.indexOf("<textarea"), "it is read before the button, not after");
});

// ---------- item 7: the audit log is closed to the public key ----------

const SQL = read("supabase/migrations/0024_sync_audit_log_private.sql").replace(/--.*$/gm, "");

test("the migration closes the audit log to the public key, keeps row level security on, changes no data, and can be run twice", () => {
  assert.match(SQL, /alter table public\.admin_audit_log enable row level security;/);
  assert.match(SQL, /revoke all on table public\.admin_audit_log from anon, authenticated;/);
  assert.ok(!/\bdrop\b|\bdelete\b|\btruncate\b|\bupdate\b|\binsert\b/i.test(SQL), "it only closes access");
  assert.ok(!/service_role/i.test(SQL), "the server's own access is not touched");
  const files = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  assert.ok(files.indexOf("0024_sync_audit_log_private.sql") > files.indexOf("0023_sync_owner_replies.sql"));
  assert.equal(files.filter((f) => f.startsWith("0024_")).length, 1);
});

test("the server still writes the audit log with the service role, which the migration does not affect", () => {
  assert.match(read("lib/admin/audit.js"), /\.from\("admin_audit_log"\)/);
  assert.match(read("lib/supabase/server.js"), /SUPABASE_SERVICE_ROLE_KEY/, "the server's client is the service role, which ignores row level security and is not touched by the revoke");
  assert.doesNotMatch(read("lib/admin/audit.js"), /NEXT_PUBLIC_SUPABASE_ANON/, "the audit log is never reached with the public key");
});

// ---------- item 1: a button that is held looks held, and the one that was pressed says it is working ----------

test("every disabled button in the dashboard is dimmed and shows it cannot be pressed", () => {
  const css = read("app/admin/sync/sync-shell.css");
  assert.match(css, /\.sync-shell \.btn-red:disabled,\s*\.sync-shell \.btn-outline:disabled,\s*\.sync-shell button:disabled \{ opacity: 0\.5; cursor: not-allowed;/);
  assert.match(read("app/admin/sync/layout.js"), /className=\{`sync-shell /, "the dashboard pages are all inside that shell");
});

test("the buttons that save or change something say \"Working…\" while they do", () => {
  assert.match(read("app/admin/sync/[id]/MerchantEditorClient.js"), /\{saving \? "Working…" : active \? "Remove tag" : "Restore tag"\}/);
  assert.match(read("app/admin/sync/[id]/MerchantEditorClient.js"), /\{saving \? "Saving\.\.\." : "Save changes"\}/);
  assert.match(read("app/admin/sync/new/NewMerchantClient.js"), /\{saving \? "Saving\.\.\." : "Tag as business"\}/);
  assert.match(read("app/admin/sync/[id]/QrCodesPanel.js"), /\{busy \? "Working…" : code\.active \? "Switch off" : "Switch on"\}/);
  const owner = read("app/admin/sync/[id]/OwnerPanel.js");
  for (const text of ['busy === "unlink" ? "Working…" : "Yes, unlink"', 'busy === "lookup" ? "Working…" : "Look up"', 'busy === "link" ? "Working…" : "Yes, replace"']) assert.ok(owner.includes(text), text);
});
