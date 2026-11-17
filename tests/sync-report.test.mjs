// Patch 14e: the audit report: its content, the private link, the open count, and who can see what.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const R = await import("../lib/sync/report.js");
const P = await import("../lib/sync/prospects.js");
const S = await import("../lib/sync/reportStore.js");
const RS = await import("../lib/sync/reportSettings.js");
const { PUT: settingsRoute } = await import("../app/api/admin/sync/report-settings/route.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");
const { POST: createRoute } = await import("../app/api/admin/sync/prospects/route.js");
const { PUT: putRoute } = await import("../app/api/admin/sync/prospects/[id]/route.js");
const read = (file) => fs.readFileSync(file, "utf8");

const GOOD = { name: "extra", contact: "partial", hours: "full", festival: "no", categories: 1, description: "none", photos: 3, photoAgeMonths: 8, rating: 4.2, reviews: 12, waiting: 3, replies: "slowly", postDays: 90 };
const prospect = (o = {}) => ({ id: "p1", business_name: "Ram Cafe", area: "Patan", business_kind: "cafe", kind_label: null, facts: GOOD, drafts: { description: "A calm cafe in Patan.", festival: "Open on Dashain, 8am to 2pm." }, status: "report_ready", ...o });
const ROW = { price: "Rs 3,000 a month", phone: "98 0000 0000", whatsapp: "98 1111 1111", booking_link: "https://cal.example.com/kastochha" };
const contactsFrom = RS.contactsFrom;

// ---------- the settings ----------

test("a setting not filled in shows its bracketed placeholder, and unfilled() names them; the booking link is optional", () => {
  const empty = contactsFrom(null);
  assert.deepEqual([empty.price, empty.phone, empty.whatsapp, empty.booking], ["[PRICE]", "[PHONE]", "[WHATSAPP]", ""]);
  assert.deepEqual(RS.unfilled(empty), ["[PRICE]", "[PHONE]", "[WHATSAPP]"]);
  const full = contactsFrom(ROW);
  assert.deepEqual(RS.unfilled(full), []);
  assert.equal(full.price, "Rs 3,000 a month");
  assert.deepEqual(RS.unfilled(contactsFrom({ ...ROW, phone: "" })), ["[PHONE]"]);
  assert.equal(RS.unfilled(contactsFrom({ ...ROW, booking_link: null })).length, 0, "no booking link is not a missing placeholder");
});

test("the settings form accepts blanks, tidy numbers and an https link, and refuses the rest", () => {
  assert.deepEqual(RS.cleanSettings({ price: " Rs  3,000 ", phone: "+977 98-0000 0000", whatsapp: "", booking: "" }).values, { price: "Rs 3,000", phone: "+977 98-0000 0000", whatsapp: null, booking_link: null });
  for (const bad of ["javascript:alert(1)", "http://insecure.example", "not a link", "https://user:pw@x.example", "data:text/html,hi"]) assert.ok(RS.cleanSettings({ booking: bad }).error, bad);
  assert.equal(RS.cleanSettings({ booking: "https://cal.example.com/x" }).values.booking_link, "https://cal.example.com/x");
  assert.ok(RS.cleanSettings({ phone: "call me" }).error);
  assert.ok(RS.cleanSettings({ whatsapp: "9".repeat(41) }).error);
  assert.ok(RS.cleanSettings({ price: "x".repeat(121) }).error);
  assert.ok(RS.cleanSettings(null).error && RS.cleanSettings([1]).error);
  assert.ok(!RS.cleanSettings({ price: "a\nb\u0000c" }).values.price.includes("\n"));
});

test("a stored booking link that is not https is never shown", () => {
  assert.equal(contactsFrom({ ...ROW, booking_link: "javascript:alert(1)" }).booking, "");
});

test("the copy kept when a report is sent is used instead of today's settings, and only a full valid copy counts", () => {
  const frozen = { price: "Rs 2,500 a month", phone: "98 0000 0000", whatsapp: "98 1111 1111", booking: "" };
  assert.equal(RS.contactsForProspect({ report_contacts: frozen }, ROW).price, "Rs 2,500 a month");
  assert.equal(RS.contactsForProspect({ report_contacts: null }, ROW).price, "Rs 3,000 a month");
  for (const bad of [{ ...frozen, price: "[PRICE]" }, { ...frozen, phone: "" }, "text", [], { ...frozen, booking: "javascript:x" }]) {
    const got = RS.cleanFrozen(bad);
    assert.ok(got === null || got.booking === "", JSON.stringify(bad));
  }
  assert.equal(RS.cleanFrozen({ ...frozen, price: "[PRICE]" }), null);
});

test("link-preview robots, crawlers, scripts and an empty agent are not counted as opens; a browser is", () => {
  for (const ua of ["WhatsApp/2.23", "facebookexternalhit/1.1", "Slackbot-LinkExpanding", "Googlebot/2.1", "curl/8", "python-requests/2", "TelegramBot", "", undefined, null]) assert.equal(R.isBot(ua), true, String(ua));
  for (const ua of ["Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1"]) assert.equal(R.isBot(ua), false);
});

test("a link address is exactly 32 URL-safe characters", () => {
  assert.ok(R.TOKEN_RE.test("a".repeat(32)));
  for (const bad of ["", "a".repeat(31), "a".repeat(33), "a".repeat(31) + "/", "../../admin".padEnd(32, "a"), "a b".padEnd(32, "a")]) assert.ok(!R.TOKEN_RE.test(bad), bad);
});

// ---------- the content ----------

test("the report lists all 13 checks, the score from the rules, and at most five fixes", () => {
  const r = R.buildReport(prospect(), contactsFrom(ROW), Date.UTC(2026, 10, 17, 6));
  assert.equal(r.rows.length, 13);
  assert.equal(r.date, "2026-11-17");
  assert.equal(r.name, "Ram Cafe");
  assert.ok(r.score > 0 && r.score < 100);
  assert.ok(r.projected >= r.score);
  assert.ok(r.fixes.length <= 5 && r.fixes.length > 0);
  assert.deepEqual(r.fixes.map((f) => f.n), r.fixes.map((_, i) => i + 1));
  for (const fix of r.fixes) assert.ok(fix.why && fix.how, fix.key);
  assert.deepEqual(r.drafts.map((d) => d.key), ["description", "festival"], "only the drafts that were written");
});

test("the same audit always gives the same report", () => {
  const a = R.buildReport(prospect(), contactsFrom(ROW), 1_800_000_000_000);
  const b = R.buildReport(prospect(), contactsFrom(ROW), 1_800_000_000_000);
  assert.deepEqual(a, b);
});

test("what the facts say is in plain words, an unknown check says Not checked and has no points", () => {
  const r = R.buildReport(prospect({ facts: { waiting: 1, postDays: 999, photos: 0 } }), contactsFrom(ROW));
  const by = Object.fromEntries(r.rows.map((row) => [row.key, row]));
  assert.equal(by.waiting.says, "1 review has no reply");
  assert.equal(by.posts.says, "Has never posted");
  assert.equal(by.photoAge.says, "No photos to be recent");
  assert.equal(by.name.says, "Not checked");
  assert.equal(by.name.points, null);
  assert.equal(by.name.known, false);
});

test("an audit with no facts still builds, with no score and no fixes", () => {
  const r = R.buildReport(prospect({ facts: {}, drafts: {} }), contactsFrom(null));
  assert.equal(r.score, null);
  assert.equal(r.fixes.length, 0);
  assert.equal(r.drafts.length, 0);
});

test("the report never promises a result, and calls the projection an estimate", () => {
  const all = Object.values(R.FIX_TEXT).map((t) => `${t.why} ${t.how}`).join(" ") + R.DISCLAIMER;
  assert.ok(!/\b(guarantee|guaranteed|rank higher|top of google|first page|#1|number one)\b/i.test(all));
  assert.match(R.DISCLAIMER, /not a ranking/i);
  assert.match(R.DISCLAIMER, /does not promise/i);
  assert.match(R.DISCLAIMER, /estimate/i);
  assert.match(read("app/report/ReportView.js"), /an estimate, not a promise/);
});

test("the full report is five pages, the summary two, and each page says its number", () => {
  const view = read("app/report/ReportView.js");
  assert.equal((view.match(/<section className="rp-page">/g) || []).length, 7);
  for (const n of [1, 2, 3, 4, 5]) assert.ok(view.includes(`page={${n}} of={5}`), `full page ${n}`);
  for (const n of [1, 2]) assert.ok(view.includes(`page={${n}} of={2}`), `summary page ${n}`);
  assert.ok(!/dangerouslySetInnerHTML/.test(view), "the owner's text is shown as text, never as markup");
});

test("the email and the WhatsApp message carry both links and the settings, and no email address or personal data", () => {
  const links = { full: "https://www.kastochhanepal.com/report/" + "a".repeat(32), summary: "https://www.kastochhanepal.com/report/" + "a".repeat(32) + "?view=summary" };
  const t = R.outreachTexts(prospect(), links, contactsFrom(ROW));
  assert.ok(t.email.includes(links.full) && t.email.includes(links.summary));
  assert.ok(t.whatsapp.includes(links.summary));
  assert.ok(t.email.includes("98 0000 0000") && t.whatsapp.includes("98 1111 1111"));
  assert.match(t.subject, /Ram Cafe/);
  assert.ok(t.whatsapp.length < 400, "short enough for a message");
  const placeholders = R.outreachTexts(prospect(), links, contactsFrom(null));
  assert.ok(placeholders.email.includes("[PHONE]") && placeholders.whatsapp.includes("[WHATSAPP]"));
});

// ---------- the moves ----------

const TODAY = "2026-11-17";
let n = 0;
const token = () => `tok${String(++n).padStart(29, "0")}`;
const typed = (o = {}) => ({ ...prospect({ status: "typed" }), ...o });

test("making the report makes the link once, and makes it again keeps it", () => {
  const first = P.planProspect(typed(), { action: "make_report", factsChecked: true, draftsChecked: true }, TODAY, token);
  assert.equal(first.values.report_token.length, 32);
  const again = P.planProspect(typed({ report_token: "x".repeat(32) }), { action: "make_report", factsChecked: true, draftsChecked: true }, TODAY, token);
  assert.equal(again.values.report_token, undefined, "the existing link is kept");
});

test("a new link replaces the old and starts the count again; stopping clears it; neither works before a report", () => {
  const row = prospect({ status: "sent", report_token: "o".repeat(32), report_opens: 4 });
  const fresh = P.planProspect(row, { action: "new_link" }, TODAY, token);
  assert.notEqual(fresh.values.report_token, row.report_token);
  assert.equal(fresh.values.report_opens, 0);
  assert.equal(P.planProspect(row, { action: "stop_link" }, TODAY, token).values.report_token, null);
  assert.equal(P.planProspect(prospect({ status: "typed" }), { action: "new_link" }, TODAY, token).status, 409);
  assert.equal(P.planProspect(prospect({ status: "declined", report_token: "x" }), { action: "new_link" }, TODAY, token).status, 409);
  assert.equal(P.planProspect(prospect({ report_token: null }), { action: "stop_link" }, TODAY, token).status, 409);
});

// ---------- the link, the count and the routes ----------

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
const as = (userId, role) => { globalThis.__KC_TEST__ = { userId, roles: userId ? { [userId]: role } : {}, cookies: {}, revalidatedPaths: [] }; };
beforeEach(() => { fake.reset(); as("user_admin", "admin"); });
const req = (method, body) => new Request("https://www.kastochhanepal.com/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const put = async (id, body) => { const r = await putRoute(req("PUT", body), { params: { id } }); return { status: r.status, body: await r.json() }; };
async function readyProspect() {
  const made = await (await createRoute(req("POST", { businessName: "Ram Cafe", area: "Patan", businessKind: "cafe" }))).json();
  const id = made.prospect.id;
  await put(id, { action: "facts", facts: GOOD, drafts: { description: "A calm cafe in Patan." } });
  const r = await put(id, { action: "make_report", factsChecked: true, draftsChecked: true });
  assert.equal(r.status, 200);
  // The real table gives report_opens a default of 0 (migration 0028); the fake database applies no defaults.
  fake.tables.sync_prospects[0].report_opens = 0;
  return id;
}
const row = () => fake.tables.sync_prospects[0];

test("making the report through the route gives a private link, and the log never holds it", async () => {
  const id = await readyProspect();
  assert.match(row().report_token, /^[A-Za-z0-9_-]{32}$/);
  assert.ok(!JSON.stringify(fake.tables.admin_audit_log).includes(row().report_token));
  assert.equal(id, row().id);
});

test("the link finds its report while it is on, and not when stopped, replaced, or after the facts are edited again", async () => {
  const id = await readyProspect();
  const sb = createServerSupabase();
  const t1 = row().report_token;
  assert.equal((await S.getReportByToken(sb, t1)).id, id);
  assert.equal(await S.getReportByToken(sb, "z".repeat(32)), null);
  assert.equal((await put(id, { action: "new_link" })).status, 200);
  const t2 = row().report_token;
  assert.notEqual(t1, t2);
  assert.equal(await S.getReportByToken(sb, t1), null, "the old address is dead");
  assert.equal((await S.getReportByToken(sb, t2)).id, id);
  assert.equal((await put(id, { action: "facts", facts: { ...GOOD, waiting: 0 }, drafts: {} })).status, 200);
  assert.equal(await S.getReportByToken(sb, t2), null, "edited again: off until the report is made again");
  assert.equal((await put(id, { action: "make_report", factsChecked: true, draftsChecked: true })).status, 200);
  assert.equal(row().report_token, t2, "and the same address comes back");
  assert.equal((await put(id, { action: "stop_link" })).status, 200);
  assert.equal(row().report_token, null);
});

test("a business that said no has no report on show", async () => {
  const id = await readyProspect();
  await put(id, { action: "declined" });
  assert.equal(await S.getReportByToken(createServerSupabase(), row().report_token), null);
});

test("an open is counted, two at once do not undo each other, and a failed count never breaks the report", async () => {
  const id = await readyProspect();
  const sb = createServerSupabase();
  const found = await S.getReportByToken(sb, row().report_token);
  await S.recordOpen(sb, found, new Date("2026-11-18T05:00:00Z"));
  assert.equal(row().report_opens, 1);
  assert.equal(row().report_last_opened_at, "2026-11-18T05:00:00.000Z");
  const second = await S.getReportByToken(sb, row().report_token);
  await S.recordOpen(sb, second);
  assert.equal(row().report_opens, 2);
  await S.recordOpen(sb, found); // read when the count was 0: it must not write 1 over the newer 2
  assert.equal(row().report_opens, 2, "a stale read does not write over a newer count");
  const again = await S.getReportByToken(sb, row().report_token);
  await S.recordOpen(sb, again);
  assert.equal(row().report_opens, 3);
  await assert.doesNotReject(S.recordOpen({ from() { throw new Error("down"); } }, again));
  assert.equal(id, row().id);
});

test("only an admin can make, replace or stop the link", async () => {
  const id = await readyProspect();
  const before = row().report_token;
  for (const [who, role] of [[null, null], ["user_c", "user"], ["user_op", "operator"]]) {
    as(who, role);
    for (const action of ["new_link", "stop_link"]) assert.ok([401, 403].includes((await put(id, { action })).status));
  }
  assert.equal(row().report_token, before);
});

// ---------- the pages ----------

test("the public report page: validates the address, hides when off, skips bots, and keeps out of search", () => {
  const page = read("app/report/[token]/page.js");
  assert.ok(page.indexOf("TOKEN_RE.test(token)") < page.indexOf("createServerSupabase()"), "a bad address never reaches the database");
  assert.match(page, /index: false, follow: false/);
  assert.match(page, /if \(!prospect\) notFound\(\)/);
  assert.match(page, /if \(!isBot\(headers\(\)\.get\("user-agent"\)\)\) await recordOpen/);
  assert.ok(!/requireRole|syncAccess/.test(page), "no login is needed to open it");
  assert.ok(!/\bsent_via\b|\bcreated_by\b|merchant_id|match_key/.test(page), "nothing internal is put on the page");
});

test("the admin preview checks for an admin first, and never counts an open", () => {
  const page = read("app/admin/sync/audit/[id]/report/page.js");
  assert.ok(page.indexOf("requireRole(ROLE.ADMIN)") < page.indexOf("getProspect("));
  assert.ok(!/recordOpen/.test(page));
  assert.ok(!/syncAccess/.test(page));
});

test("the report's address is kept out of robots.txt's allowed paths, and the print button needs no server", () => {
  assert.match(read("app/robots.txt/route.js"), /Disallow: \/report\//);
  const button = read("app/report/PrintButton.js");
  assert.match(button, /window\.print\(\)/);
  assert.ok(!/fetch\(/.test(button));
  assert.match(read("app/report/report.css"), /@page \{ size: A4/);
});

test("the migration adds the link columns only, and is safe to replay", () => {
  const sql = read("supabase/migrations/0028_sync_report_link.sql").replace(/--.*$/gm, "");
  assert.equal((sql.match(/add column if not exists/gi) || []).length, 3);
  assert.match(sql, /create unique index if not exists/i);
  assert.ok(!/drop\s|delete\s+from|truncate|alter column/i.test(sql));
});

test("the report's price and numbers are not environment settings any more, and the runbook explains the settings page", () => {
  for (const name of ["REPORT_PRICE", "REPORT_PHONE", "REPORT_WHATSAPP", "REPORT_BOOKING_LINK"]) assert.ok(!read(".env.example").includes(name), `${name} should not be a Vercel setting`);
  const book = read("docs/sync/runbook.md");
  assert.match(book, /Audit, Report settings/);
  assert.match(book, /0029_sync_report_settings\.sql/);
  for (const file of ["lib/sync/report.js", "app/report/[token]/page.js", "app/admin/sync/audit/[id]/page.js"]) assert.ok(!/process\.env\.REPORT_|contactsFromEnv/.test(read(file)), file);
});

test("the settings migration adds one private table and one column, and is safe to replay", () => {
  const sql = read("supabase/migrations/0029_sync_report_settings.sql").replace(/--.*$/gm, "");
  assert.match(sql, /create table if not exists public\.sync_report_settings/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.sync_report_settings from anon, authenticated/i);
  assert.match(sql, /add column if not exists report_contacts jsonb/i);
  assert.ok(!/drop\s|delete\s+from|truncate|alter column/i.test(sql));
});

// ---------- the settings page and route, and the copy kept on send ----------

const saveSettings = async (body) => { const r = await settingsRoute(req("PUT", body)); return { status: r.status, body: await r.json() }; };

test("only an admin can save the settings; the log keeps which changed, never the values", async () => {
  for (const [who, role, status] of [[null, null, 401], ["user_c", "user", 403], ["user_op", "operator", 403]]) {
    as(who, role);
    assert.equal((await saveSettings({ price: "Rs 1" })).status, status);
  }
  assert.equal(fake.tables.sync_report_settings.length, 0);
  as("user_admin", "admin");
  assert.equal((await saveSettings({ price: "Rs 3,000 a month", phone: "98 0000 0000", whatsapp: "", booking: "" })).status, 200);
  assert.equal(fake.tables.sync_report_settings[0].price, "Rs 3,000 a month");
  const log = JSON.stringify(fake.tables.admin_audit_log);
  assert.ok(log.includes("sync.report_settings.update") && log.includes("price") && log.includes("phone"));
  assert.ok(!log.includes("3,000") && !log.includes("98 0000"), "no value in the log");
  assert.equal((await saveSettings({ price: "Rs 3,000 a month", phone: "98 0000 0000", whatsapp: "", booking: "" })).body.unchanged, true);
  assert.equal(fake.tables.admin_audit_log.length, 1, "no change, no log entry");
  assert.equal((await saveSettings({ price: "Rs 3,500", phone: "98 0000 0000", whatsapp: "", booking: "" })).status, 200);
  assert.equal(fake.tables.sync_report_settings.length, 1, "one row, updated in place");
  assert.equal(fake.tables.sync_report_settings[0].price, "Rs 3,500");
  assert.equal((await saveSettings({ booking: "http://x.example" })).status, 400);
});

test("if the log cannot be written, the settings are not changed", async () => {
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await saveSettings({ price: "Rs 1" })).status, 500);
  fake.failWritesTo = null;
  assert.equal(fake.tables.sync_report_settings.length, 0);
});

test("recording a send keeps the settings of that day, and a later price change does not alter that report", async () => {
  await saveSettings({ price: "Rs 3,000 a month", phone: "98 0000 0000", whatsapp: "98 1111 1111", booking: "" });
  const id = await readyProspect();
  assert.equal((await put(id, { action: "sent", via: "email", sentOn: "2026-11-01" })).status, 200);
  assert.equal(row().report_contacts.price, "Rs 3,000 a month");
  await saveSettings({ price: "Rs 9,999 a month", phone: "98 0000 0000", whatsapp: "98 1111 1111", booking: "" });
  const stored = await RS.readSettings(createServerSupabase());
  assert.equal(RS.contactsForProspect(row(), stored).price, "Rs 3,000 a month", "the sent report still shows the old price");
  assert.equal(RS.contactsForProspect({ report_contacts: null }, stored).price, "Rs 9,999 a month", "an unsent one follows the settings");
});

test("a report sent while a placeholder was showing keeps nothing, so it follows the settings once they are filled in", async () => {
  const id = await readyProspect();
  assert.equal((await put(id, { action: "sent", via: "email", sentOn: "2026-11-01" })).status, 200);
  assert.ok(!row().report_contacts);
});

test("the settings page and the form are admin-only and the audit list links to them", () => {
  const page = read("app/admin/sync/audit/settings/page.js");
  assert.ok(page.indexOf("requireRole(ROLE.ADMIN)") < page.indexOf("readSettings("));
  assert.ok(!/syncAccess/.test(page));
  assert.match(read("app/api/admin/sync/report-settings/route.js"), /requireRole\(ROLE\.ADMIN\)/);
  assert.match(read("app/admin/sync/audit/page.js"), /href="\/admin\/sync\/audit\/settings"/);
});
