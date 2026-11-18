// Patch 14o: messaging the owner on WhatsApp by hand. The team's phone sends it; we build the words and the link.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const M = await import("../lib/sync/ownerMessage.js");
const { PUT: putRoute, POST: postRoute } = await import("../app/api/admin/sync/merchants/[id]/owner-message/route.js");
const read = (file) => fs.readFileSync(file, "utf8");

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
const as = (userId, role) => { globalThis.__KC_TEST__ = { userId, roles: userId ? { [userId]: role } : {}, cookies: {}, revalidatedPaths: [] }; };
const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const seed = (id = ID, extra = {}) => fake.tables.sync_merchants.push({ id, slug: `b-${id.slice(0, 4)}`, topic_slug: `t-${id.slice(0, 4)}`, business_name: "Himal Brew House", area: "Jhamsikhel", status: "active", owner_whatsapp: null, owner_messaged_at: null, ...extra });
beforeEach(() => { fake.reset(); as("user_admin", "admin"); seed(); });
const send = async (route, body, id = ID) => { const r = await route(new Request("https://www.kastochhanepal.com/x", { method: route === putRoute ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), { params: { id } }); return { status: r.status, body: await r.json() }; };
const put = (b, id) => send(putRoute, b, id);
const mark = (id) => send(postRoute, undefined, id);
const row = () => fake.tables.sync_merchants[0];

// ---------- the number ----------

test("a number becomes digits with the country code; a Nepal mobile gets 977; a blank clears it; nonsense is refused", () => {
  assert.deepEqual(M.cleanWhatsapp("9841 000 000"), { value: "9779841000000" });
  assert.deepEqual(M.cleanWhatsapp("984-1000-000"), { value: "9779841000000" });
  assert.deepEqual(M.cleanWhatsapp("+977 9841000000"), { value: "9779841000000" });
  assert.deepEqual(M.cleanWhatsapp("00977 9841000000"), { value: "9779841000000" });
  assert.deepEqual(M.cleanWhatsapp("+91 98765 43210"), { value: "919876543210" });
  assert.deepEqual(M.cleanWhatsapp(9841000000), { value: "9779841000000" });
  for (const blank of ["", "   ", null, undefined]) assert.deepEqual(M.cleanWhatsapp(blank), { value: "" });
  for (const bad of ["abc", "98410", "1".repeat(16), "9841 000 000 ext 5", "<script>", {}, [], true, "1".repeat(31), "+++"]) assert.ok(M.cleanWhatsapp(bad).error, JSON.stringify(bad));
});

test("the WhatsApp link carries the words; no number means WhatsApp asks who to send it to", () => {
  const text = "Namaste! 2 things & more?\nNext line";
  const withNumber = M.whatsappLink("9779841000000", text);
  assert.ok(withNumber.startsWith("https://wa.me/9779841000000?text="));
  assert.equal(decodeURIComponent(withNumber.split("?text=")[1]), text);
  assert.ok(M.whatsappLink("", text).startsWith("https://wa.me/?text="));
  for (const bad of [null, undefined, "abc", "12", "9779841000000/../x"]) assert.ok(M.whatsappLink(bad, "x").startsWith("https://wa.me/?text="), String(bad));
});

// ---------- the words ----------

test("what is waiting is counted from the three lists: menu, posts, replies, and unanswered questions", () => {
  const s = M.summarizeWaiting({
    menu: [{ status: "waiting" }, { status: "waiting" }, { status: "draft" }, { status: "confirmed" }],
    posts: [{ status: "waiting" }, { status: "drafted" }, { status: "approved" }],
    replies: [{ status: "waiting" }, { status: "asking", owner_answer: null }, { status: "asking", owner_answer: "done" }, { status: "drafted" }]
  });
  assert.deepEqual(s.counts, { menu: 2, posts: 1, replies: 1, questions: 1 });
  assert.equal(s.total, 5);
  assert.equal(M.summarizeWaiting({}).total, 0);
});

test("the message holds counts and the owner's link only, never any words of the business's work", () => {
  const text = M.buildMessage({ businessName: "Himal Brew House", counts: { menu: 2, posts: 0, replies: 1, questions: 1 }, total: 4 }, "https://site.test/owner/x/needs-you");
  assert.match(text, /4 things need you/);
  assert.match(text, /2 menu items to check/);
  assert.match(text, /1 reply to check/);
  assert.match(text, /1 question from us/);
  assert.ok(!text.includes("post to check"));
  assert.ok(text.includes("https://site.test/owner/x/needs-you"));
  assert.match(M.buildMessage({ businessName: "x", counts: { menu: 1, posts: 0, replies: 0, questions: 0 }, total: 1 }, "l"), /1 thing needs you/);
  assert.match(M.buildMessage({ businessName: "x", counts: { menu: 0, posts: 0, replies: 0, questions: 0 }, total: 0 }, "l"), /Nothing is waiting/);
  assert.ok(M.buildMessage({ businessName: "  A\n\nB  ", counts: { menu: 1, posts: 0, replies: 0, questions: 0 }, total: 1 }, "l").includes("A B"));
});

// ---------- saving and marking ----------

test("an admin saves the number as digits and a blank removes it", async () => {
  const r = await put({ whatsapp: "9841 000 000" });
  assert.equal(r.status, 200);
  assert.equal(r.body.whatsapp, "9779841000000");
  assert.equal(row().owner_whatsapp, "9779841000000");
  assert.equal((await put({ whatsapp: "" })).status, 200);
  assert.equal(row().owner_whatsapp, null);
});

test("a bad or missing number changes nothing and writes no log entry", async () => {
  await put({ whatsapp: "9841 000 000" });
  const before = fake.tables.admin_audit_log.length;
  for (const body of [{ whatsapp: "abc" }, { whatsapp: "123" }, {}, { number: "9841000000" }, [], "x"]) assert.equal((await put(body)).status, 400, JSON.stringify(body));
  assert.equal(row().owner_whatsapp, "9779841000000");
  assert.equal(fake.tables.admin_audit_log.length, before);
});

test("marking as sent records the time for everyone", async () => {
  assert.equal(row().owner_messaged_at, null);
  const r = await mark();
  assert.equal(r.status, 200);
  assert.match(row().owner_messaged_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(r.body.messagedAt, row().owner_messaged_at);
});

test("the contact is read back, and an unreadable one says so instead of breaking", async () => {
  Object.assign(row(), { owner_whatsapp: "9779841000000", owner_messaged_at: "2026-11-17T05:00:00Z" });
  assert.deepEqual(await M.readOwnerContact((await import("../lib/supabase/server.js")).createServerSupabase(), ID), { whatsapp: "9779841000000", messagedAt: "2026-11-17T05:00:00Z", failed: false });
  fake.failReadsFrom = "sync_merchants";
  assert.equal((await M.readOwnerContact((await import("../lib/supabase/server.js")).createServerSupabase(), ID)).failed, true);
  fake.failReadsFrom = null;
});

test("a business that is not there, a bad id, a signed-out visitor and an ordinary user are all refused", async () => {
  assert.equal((await put({ whatsapp: "9841000000" }, "11111111-1111-4111-8111-999999999999")).status, 404);
  assert.equal((await mark("nope")).status, 400);
  as(null);
  assert.equal((await put({ whatsapp: "9841000000" })).status, 401);
  assert.equal((await mark()).status, 401);
  as("user_1", "user");
  assert.equal((await put({ whatsapp: "9841000000" })).status, 403);
  assert.equal((await mark()).status, 403);
  assert.equal(row().owner_whatsapp, null);
  assert.equal(row().owner_messaged_at, null);
});

test("only the business named in the address is touched", async () => {
  seed(OTHER);
  await put({ whatsapp: "9841000000" });
  await mark();
  const other = fake.tables.sync_merchants.find((m) => m.id === OTHER);
  assert.equal(other.owner_whatsapp, null);
  assert.equal(other.owner_messaged_at, null);
});

test("a Free business is held; an unreadable stage never blocks", async () => {
  Object.assign(row(), { stage: "free", trial_started_on: "2026-01-01", trial_ends_on: "2026-04-01" });
  assert.equal((await put({ whatsapp: "9841000000" })).status, 409);
  assert.equal((await mark()).status, 409);
  assert.equal(row().owner_whatsapp, null);
  Object.assign(row(), { stage: undefined });
  assert.equal((await put({ whatsapp: "9841000000" })).status, 200);
});

test("if the audit log cannot be written, nothing is saved", async () => {
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await put({ whatsapp: "9841000000" })).status, 500);
  assert.equal((await mark()).status, 500);
  fake.failWritesTo = null;
  assert.equal(row().owner_whatsapp, null);
  assert.equal(row().owner_messaged_at, null);
});

test("the audit log keeps who and what, never the number", async () => {
  await put({ whatsapp: "9841 765 432" });
  await mark();
  const log = JSON.stringify(fake.tables.admin_audit_log);
  for (const action of ["sync.owner_message.number", "sync.owner_message.sent"]) assert.ok(log.includes(action), action);
  for (const secret of ["9841", "765", "432", "977"]) assert.ok(!log.includes(secret), secret);
});

test("an operator works only on an assigned business", async () => {
  as("op_1", "operator");
  assert.equal((await put({ whatsapp: "9841000000" })).status, 404);
  assert.equal((await mark()).status, 404);
  fake.tables.sync_operator_assignments.push({ operator_user_id: "op_1", merchant_id: ID });
  assert.equal((await put({ whatsapp: "9841000000" })).status, 200);
  assert.equal((await mark()).status, 200);
});

// ---------- the page and the files ----------

test("the card is on the Google tab, hidden for a Free business, and the migration and runbook are in place", () => {
  const page = read("app/admin/sync/[id]/page.js");
  assert.ok(page.includes("<OwnerMessagePanel"));
  assert.ok(/const contact = free \? null/.test(page));
  const panel = read("app/admin/sync/[id]/OwnerMessagePanel.js");
  assert.ok(!panel.includes("alert(") && !panel.includes("confirm(") && !panel.includes("<nav"));
  assert.ok(panel.includes('rel="noopener noreferrer"'));
  const sql = read("supabase/migrations/0037_sync_owner_whatsapp.sql");
  for (const col of ["owner_whatsapp", "owner_messaged_at"]) assert.ok(sql.includes(col), col);
  assert.ok(read("docs/sync/runbook.md").includes("0037_sync_owner_whatsapp"));
});
