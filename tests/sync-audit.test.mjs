// Patch 14d: the Audit (part 1): the facts and the score, the five fixes, the prospect's moves, the routes and who may use them.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const A = await import("../lib/sync/audit.js");
const P = await import("../lib/sync/prospects.js");
const { POST: createRoute } = await import("../app/api/admin/sync/prospects/route.js");
const { PUT: putRoute, DELETE: deleteRoute } = await import("../app/api/admin/sync/prospects/[id]/route.js");
const { POST: tagRoute } = await import("../app/api/admin/sync/merchants/route.js");
const read = (file) => fs.readFileSync(file, "utf8");

const GOOD = { name: "yes", contact: "all", hours: "full", festival: "yes", categories: 3, description: "yes", photos: 10, photoAgeMonths: 1, rating: 4.5, reviews: 30, waiting: 0, replies: "fast", postDays: 3 };

// ---------- the facts ----------

test("the score items add up to 100, and a perfect profile scores 100", () => {
  const s = A.scoreFacts(GOOD);
  assert.equal(s.score, 100);
  assert.equal(s.items.reduce((n, i) => n + i.max, 0), 100);
  assert.equal(s.total, 13);
  assert.equal(s.checked, 13);
});

test("an unknown fact is left out: it neither helps nor hurts, and with none there is no score", () => {
  assert.equal(A.scoreFacts({}).score, null);
  assert.equal(A.scoreFacts(null).score, null);
  assert.equal(A.scoreFacts({ name: "yes" }).score, 100);
  assert.equal(A.scoreFacts({ name: "no" }).score, 0);
  assert.equal(A.scoreFacts({ name: "extra", hours: "none" }).score, Math.round((3 / 18) * 100));
});

test("the same facts always give the same score and the same five fixes", () => {
  const f = { name: "no", contact: "none", hours: "none", festival: "no", description: "none", waiting: 4, photos: 0, postDays: 999, replies: "never", categories: 1 };
  assert.deepEqual(A.scoreFacts(f), A.scoreFacts({ ...f }));
  assert.deepEqual(A.buildFixes(f), A.buildFixes({ ...f }));
  const fixes = A.buildFixes(f);
  assert.equal(fixes.length, 5);
  assert.ok(fixes.every((x) => x.priority === "High"), "all the gaps are large, so High comes first");
  assert.equal(A.buildFixes(GOOD).length, 0);
  assert.equal(A.buildFixes({}).length, 0);
});

test("fixes: the waiting reviews are named, High comes before Medium", () => {
  const f = A.buildFixes({ ...GOOD, waiting: 1, categories: 1 });
  assert.equal(f[0].title, "Answer the 1 review waiting");
  assert.equal(f[0].priority, "High");
  assert.equal(f.at(-1).priority, "Medium");
  assert.match(A.buildFixes({ ...GOOD, waiting: 5 })[0].title, /Answer the 5 reviews waiting/);
});

test("the projected score is never below the score nor above 100, and the unfixable (rating, reviews) are not promised", () => {
  const s = A.scoreFacts({ ...GOOD, rating: 2, reviews: 1, festival: "no" });
  assert.ok(s.projected >= s.score && s.projected <= 100);
  const onlyUnfixable = A.scoreFacts({ ...GOOD, rating: 2, reviews: 1 });
  assert.equal(onlyUnfixable.projected, onlyUnfixable.score);
});

test("cleanFacts keeps only valid answers, drops blanks, and names a bad one", () => {
  assert.deepEqual(A.cleanFacts({ name: "yes", photos: "12", rating: "4.5", hours: "", reviews: null }).facts, { name: "yes", photos: 12, rating: 4.5 });
  for (const bad of [{ name: "maybe" }, { photos: "-1" }, { photos: 1.5 }, { photos: "abc" }, { categories: 10 }, { rating: 5.5 }, { rating: "4.55" }, { postDays: 1000 }, { name: 5 }]) assert.ok(A.cleanFacts(bad).error, JSON.stringify(bad));
  assert.ok(A.cleanFacts([1]).error);
  assert.deepEqual(A.cleanFacts({ unknown: "x", __proto__: { name: "yes" } }).facts, {}, "unknown keys are never stored");
});

test("cleanDrafts tidies the words and enforces each limit", () => {
  assert.deepEqual(A.cleanDrafts({ description: "  Hello \r\n\r\n\r\n\r\nthere  ", categories: "" }).drafts, { description: "Hello\n\nthere" });
  assert.ok(A.cleanDrafts({ description: "x".repeat(751) }).error);
  assert.ok(A.cleanDrafts({ festival: 5 }).error);
  assert.deepEqual(A.cleanDrafts({ other: "ignored" }).drafts, {});
});

// ---------- the moves ----------

const row = (o = {}) => ({ id: "p1", business_name: "Ram Cafe", area: "Patan", business_kind: "cafe", match_key: "ram-cafe-patan", facts: {}, drafts: {}, facts_checked: false, drafts_checked: false, status: "new", ...o });
const TODAY = "2026-11-17";

test("a new prospect needs a name, area and a real type, and gets a match key", () => {
  const ok = P.validateNewProspect({ businessName: " Ram  Cafe ", area: "Patan", businessKind: "cafe" });
  assert.equal(ok.values.business_name, "Ram Cafe");
  assert.equal(ok.values.status, "new");
  assert.ok(ok.values.match_key);
  for (const bad of [{ area: "Patan", businessKind: "cafe" }, { businessName: "X", businessKind: "cafe" }, { businessName: "X", area: "Y", businessKind: "spaceship" }, { businessName: "X", area: "Y", businessKind: "cafe", googleMapsUrl: "https://evil.example/maps" }, null]) assert.ok(P.validateNewProspect(bad).error, JSON.stringify(bad));
});

test("saving facts moves new to typed, and any change clears both ticks", () => {
  const typed = P.planProspect(row(), { action: "facts", facts: { name: "yes" } }, TODAY);
  assert.equal(typed.values.status, "typed");
  const ready = row({ status: "report_ready", facts: { name: "yes" }, drafts: {}, facts_checked: true, drafts_checked: true });
  const same = P.planProspect(ready, { action: "facts", facts: { name: "yes" } }, TODAY);
  assert.equal(same.values.facts_checked, true);
  const changed = P.planProspect(ready, { action: "facts", facts: { name: "no" } }, TODAY);
  assert.equal(changed.values.status, "typed");
  assert.equal(changed.values.facts_checked, false);
  assert.equal(changed.values.drafts_checked, false);
  assert.equal(P.planProspect(row({ status: "typed" }), { action: "facts", facts: {} }, TODAY).values.status, "new");
});

test("the report needs known facts and both ticks, exactly true", () => {
  const typed = row({ status: "typed", facts: { name: "yes" } });
  assert.equal(P.planProspect(typed, { action: "make_report", factsChecked: true, draftsChecked: true }, TODAY).values.status, "report_ready");
  for (const input of [{ action: "make_report" }, { action: "make_report", factsChecked: true }, { action: "make_report", factsChecked: "true", draftsChecked: true }]) assert.equal(P.planProspect(typed, input, TODAY).ok, false);
  assert.equal(P.planProspect(row(), { action: "make_report", factsChecked: true, draftsChecked: true }, TODAY).status, 409);
  assert.equal(P.planProspect(row({ status: "typed", facts: {} }), { action: "make_report", factsChecked: true, draftsChecked: true }, TODAY).status, 409);
});

test("once sent, the facts and details are locked", () => {
  for (const status of ["sent", "replied", "declined", "tagged"]) {
    assert.equal(P.planProspect(row({ status }), { action: "facts", facts: { name: "yes" } }, TODAY).status, 409, status);
    assert.equal(P.planProspect(row({ status }), { action: "details", businessName: "Other" }, TODAY).status, 409, status);
  }
});

test("recording a send needs a way, a real past date, and a follow-up no earlier than the send", () => {
  const ready = row({ status: "report_ready", facts: { name: "yes" } });
  const ok = P.planProspect(ready, { action: "sent", via: "email", sentOn: "2026-11-16", followUpOn: "2026-11-23" }, TODAY);
  assert.deepEqual(ok.values, { status: "sent", sent_via: "email", sent_on: "2026-11-16", follow_up_on: "2026-11-23" });
  for (const input of [{ via: "pigeon", sentOn: TODAY }, { via: "email", sentOn: "2026-11-18" }, { via: "email", sentOn: "17/11/2026" }, { via: "email", sentOn: "2026-02-30" }, { via: "email", sentOn: "2026-11-16", followUpOn: "2026-11-15" }, { via: "email", sentOn: "2026-11-16", followUpOn: "soon" }]) assert.equal(P.planProspect(ready, { action: "sent", ...input }, TODAY).ok, false, JSON.stringify(input));
  assert.equal(P.planProspect(row(), { action: "sent", via: "email", sentOn: TODAY }, TODAY).status, 409);
});

test("replied only follows sent; said no follows a report; unknown actions are refused", () => {
  assert.equal(P.planProspect(row({ status: "sent" }), { action: "replied" }, TODAY).values.status, "replied");
  assert.equal(P.planProspect(row({ status: "report_ready" }), { action: "replied" }, TODAY).status, 409);
  assert.equal(P.planProspect(row({ status: "sent" }), { action: "declined" }, TODAY).values.status, "declined");
  assert.equal(P.planProspect(row({ status: "new" }), { action: "declined" }, TODAY).status, 409);
  assert.equal(P.planProspect(row(), { action: "tag" }, TODAY).status, 400);
  assert.equal(P.planProspect(null, { action: "facts" }, TODAY).status, 404);
  assert.equal(P.planProspect(row(), [], TODAY).status, 400);
});

test("the list: the address picks the filter, closed means said no or tagged, odd means all", () => {
  assert.deepEqual(P.parseListQuery({ status: "SENT", q: " ram " }), { status: "sent", q: "ram" });
  assert.equal(P.parseListQuery({ status: "bogus" }).status, "all");
  const list = [row({ status: "new" }), row({ id: "2", status: "typed" }), row({ id: "3", status: "declined" }), row({ id: "4", status: "tagged", business_name: "Zed" })];
  assert.equal(P.filterProspects(list, { status: "new" }).length, 2);
  assert.equal(P.filterProspects(list, { status: "closed" }).length, 2);
  assert.equal(P.filterProspects(list, { status: "all", q: "zed" }).length, 1);
  const c = P.filterCounts(list);
  assert.deepEqual([c.all, c.new, c.closed], [4, 2, 2]);
  assert.equal(P.listHref("sent", "ram"), "/admin/sync/audit?status=sent&q=ram");
  assert.equal(P.listHref("all", ""), "/admin/sync/audit");
});

// ---------- the routes ----------

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
const as = (userId, role) => { globalThis.__KC_TEST__ = { userId, roles: userId ? { [userId]: role } : {}, cookies: {}, revalidatedPaths: [] }; };
beforeEach(() => { fake.reset(); as("user_admin", "admin"); });
const req = (method, body) => new Request("https://www.kastochhanepal.com/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const create = async (body) => { const r = await createRoute(req("POST", body)); return { status: r.status, body: await r.json() }; };
const put = async (id, body) => { const r = await putRoute(req("PUT", body), { params: { id } }); return { status: r.status, body: await r.json() }; };
const NEW = { businessName: "Ram Cafe", area: "Patan", businessKind: "cafe", googleMapsUrl: "https://maps.app.goo.gl/abc" };
const lastLog = () => fake.tables.admin_audit_log.at(-1);

test("only an admin can use the audit routes: signed out, a user and an operator are refused and nothing changes", async () => {
  const made = await create(NEW);
  const id = made.body.prospect.id;
  for (const [who, role, status] of [[null, null, 401], ["user_c", "user", 403], ["user_op", "operator", 403]]) {
    as(who, role);
    assert.equal((await create({ ...NEW, businessName: "Other" })).status, status);
    assert.equal((await put(id, { action: "facts", facts: { name: "yes" } })).status, status);
    assert.equal((await deleteRoute(req("DELETE"), { params: { id } })).status, status);
  }
  assert.equal(fake.tables.sync_prospects.length, 1);
  assert.equal(fake.tables.sync_prospects[0].status, "new");
});

test("creating a prospect stores it and records only ids and status", async () => {
  const made = await create(NEW);
  assert.equal(made.status, 201);
  assert.equal(fake.tables.sync_prospects[0].created_by, "user_admin");
  assert.equal(lastLog().action, "sync.prospect.create");
  assert.equal(lastLog().status, "applied");
});

test("the same place is refused twice, whether it is a prospect or already a business", async () => {
  assert.equal((await create(NEW)).status, 201);
  const again = await create({ ...NEW, businessName: "RAM  cafe" });
  assert.equal(again.status, 409);
  assert.match(again.body.error, /already on the audit list/);
  fake.tables.sync_merchants.push({ id: "m1", business_name: "Sita Momo", area: "Thamel", topic_slug: P.matchKey("Sita Momo", "Thamel"), slug: "sita-momo" });
  const biz = await create({ businessName: "Sita Momo", area: "Thamel", businessKind: "restaurant" });
  assert.equal(biz.status, 409);
  assert.match(biz.body.error, /already a business/);
  assert.equal(fake.tables.sync_prospects.length, 1);
});

test("an invalid or unreadable body is refused before anything is written", async () => {
  assert.equal((await create({ businessName: "X" })).status, 400);
  assert.equal(fake.tables.sync_prospects.length, 0);
  assert.equal(fake.tables.admin_audit_log.length, 0);
});

test("the whole journey: facts, report, sent, replied, each recorded without the facts or drafts' words", async () => {
  const id = (await create(NEW)).body.prospect.id;
  const secret = "A secret draft sentence about the owner.";
  assert.equal((await put(id, { action: "facts", facts: GOOD, drafts: { description: secret } })).status, 200);
  assert.equal(fake.tables.sync_prospects[0].status, "typed");
  assert.equal((await put(id, { action: "make_report", factsChecked: true })).status, 400);
  assert.equal((await put(id, { action: "make_report", factsChecked: true, draftsChecked: true })).status, 200);
  assert.equal(fake.tables.sync_prospects[0].status, "report_ready");
  assert.equal((await put(id, { action: "sent", via: "whatsapp", sentOn: "2026-11-01" })).status, 200);
  assert.equal((await put(id, { action: "facts", facts: { name: "no" } })).status, 409, "locked once sent");
  assert.equal((await put(id, { action: "replied" })).status, 200);
  assert.equal(fake.tables.sync_prospects[0].status, "replied");
  const all = JSON.stringify(fake.tables.admin_audit_log);
  assert.ok(!all.includes(secret), "the log never holds the drafts' words");
  assert.ok(!all.includes('"facts"'), "nor the facts");
  assert.deepEqual(fake.tables.admin_audit_log.map((l) => l.action), ["sync.prospect.create", "sync.prospect.facts", "sync.prospect.make_report", "sync.prospect.sent", "sync.prospect.replied"]);
});

test("a bad id, a missing prospect and a refused move change nothing", async () => {
  assert.equal((await put("not-a-uuid", { action: "replied" })).status, 400);
  assert.equal((await put("33333333-3333-4333-8333-333333333333", { action: "replied" })).status, 404);
  assert.equal(fake.tables.admin_audit_log.length, 0);
});

test("if the audit log cannot be written, nothing is changed", async () => {
  const id = (await create(NEW)).body.prospect.id;
  fake.failWritesTo = "admin_audit_log";
  const r = await put(id, { action: "facts", facts: { name: "yes" } });
  assert.equal(r.status, 500);
  fake.failWritesTo = null;
  assert.equal(fake.tables.sync_prospects[0].status, "new");
});

test("deleting a prospect removes it and records it; a missing one is 404", async () => {
  const id = (await create(NEW)).body.prospect.id;
  assert.equal((await deleteRoute(req("DELETE"), { params: { id } })).status, 200);
  assert.equal(fake.tables.sync_prospects.length, 0);
  assert.equal(lastLog().action, "sync.prospect.delete");
  assert.equal((await deleteRoute(req("DELETE"), { params: { id } })).status, 404);
  assert.equal((await deleteRoute(req("DELETE"), { params: { id: "x" } })).status, 400);
});

test("tagging a business from a prospect links them and closes the prospect", async () => {
  const id = (await create(NEW)).body.prospect.id;
  const r = await tagRoute(req("POST", { businessName: "Ram Cafe", area: "Patan", businessKind: "cafe", threadMode: "new", prospectId: id }));
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.equal(body.prospectLinked, true);
  assert.equal(fake.tables.sync_prospects[0].status, "tagged");
  assert.equal(fake.tables.sync_prospects[0].merchant_id, body.merchant.id);
});

test("a prospect that is already linked or does not exist never blocks tagging the business", async () => {
  const r = await tagRoute(req("POST", { businessName: "Sita Momo", area: "Thamel", businessKind: "restaurant", threadMode: "new", prospectId: "44444444-4444-4444-8444-444444444444" }));
  assert.equal(r.status, 201);
  assert.equal((await r.json()).prospectLinked, false);
  const none = await tagRoute(req("POST", { businessName: "Hari Bakery", area: "Lazimpat", businessKind: "bakery", threadMode: "new" }));
  assert.equal(none.status, 201);
  assert.equal("prospectLinked" in (await none.json()), false);
});

// ---------- the screens ----------

test("every audit page and route checks for an admin, never an operator", () => {
  for (const file of ["app/admin/sync/audit/page.js", "app/admin/sync/audit/new/page.js", "app/admin/sync/audit/[id]/page.js", "app/api/admin/sync/prospects/route.js", "app/api/admin/sync/prospects/[id]/route.js"]) {
    const src = read(file);
    assert.match(src, /requireRole\(ROLE\.ADMIN\)/, file);
    assert.ok(!/syncAccess/.test(src), `${file} must not be open to operators`);
  }
  const nav = read("lib/sync/nav.js");
  assert.match(nav, /label: "Audit"[^\n]*roles: \["admin"\]/);
});

test("the migration is private, additive and safe to replay", () => {
  const sql = read("supabase/migrations/0027_sync_prospects.sql");
  assert.match(sql, /create table if not exists public\.sync_prospects/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.sync_prospects from anon, authenticated/i);
  assert.ok(!/drop\s+table|delete\s+from|truncate/i.test(sql));
});

test("the tag form carries the prospect across, and the page only trusts a real id", () => {
  const page = read("app/admin/sync/new/page.js");
  assert.match(page, /UUID_RE\.test\(id\)/);
  assert.match(read("app/admin/sync/new/NewMerchantClient.js"), /prospectId: initial\?\.prospectId/);
});
