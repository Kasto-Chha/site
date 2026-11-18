// Patch 14n: what an owner may do: approve what is waiting, send it back with a comment, answer the team's question.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const A = await import("../lib/sync/ownerActions.js");
const O = await import("../lib/sync/owner.js");
const { POST: reviewRoute } = await import("../app/api/owner/merchants/[id]/review/route.js");
const { POST: answerRoute } = await import("../app/api/owner/merchants/[id]/answer/route.js");
const { PATCH: teamReplies } = await import("../app/api/admin/sync/merchants/[id]/replies/route.js");
const { PATCH: teamPosts } = await import("../app/api/admin/sync/merchants/[id]/posts/route.js");
const { PATCH: teamMenu } = await import("../app/api/admin/sync/merchants/[id]/menu/route.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");
const read = (file) => fs.readFileSync(file, "utf8");

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
const as = (userId, role) => { globalThis.__KC_TEST__ = { userId, roles: userId ? { [userId]: role } : {}, cookies: {}, revalidatedPaths: [] }; };
const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const seedMerchant = (id, owner, extra = {}) => fake.tables.sync_merchants.push({ id, slug: `b-${id.slice(0, 4)}`, topic_slug: `t-${id.slice(0, 4)}`, business_name: id === M1 ? "Himal Brew House" : "Other Cafe", area: "Jhamsikhel", business_kind: "cafe", status: "active", owner_user_id: owner, ...extra });
beforeEach(() => { fake.reset(); n = 0; as("owner_1", "user"); seedMerchant(M1, "owner_1"); seedMerchant(M2, "owner_2"); });
const call = async (route, body, id = M1) => { const r = await route(new Request("https://www.kastochhanepal.com/x", { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), { params: { id } }); return { status: r.status, body: await r.json() }; };
const review = (b, id) => call(reviewRoute, b, id);
const answer = (b, id) => call(answerRoute, b, id);
const menu = (merchant, status, extra = {}) => { const row = { id: uuid(), merchant_id: merchant, section: "Drinks", name: `Item ${n}`, description: "d", price: "150", unit: "cup", status, position: n, owner_note: null, ...extra }; fake.tables.sync_menu_items.push(row); return row; };
const post = (merchant, status, extra = {}) => { const row = { id: uuid(), merchant_id: merchant, title: "TEAM TITLE", body: "Post words", kind: "update", status, planned_on: "2026-11-20", button_link: null, owner_note: null, ...extra }; fake.tables.sync_posts.push(row); return row; };
const reply = (merchant, status, extra = {}) => { const row = { id: uuid(), merchant_id: merchant, reviewer: "Sita", stars: 2, review: "Cold coffee", draft: "Sorry", status, owner_note: null, team_question: null, owner_answer: null, owner_answered_at: null, ...extra }; fake.tables.sync_replies.push(row); return row; };

// ---------- the rules ----------

test("a decision needs a known kind, a real id and a clear choice; a change needs a short comment", () => {
  const id = uuid().replace("0000", "abcd");
  const ok = (kind, decision, extra = {}) => A.cleanDecision({ kind, id: M1, decision, ...extra });
  assert.deepEqual(ok("menu", "approve"), { kind: "menu", id: M1, decision: "approve" });
  assert.deepEqual(ok("post", "change", { note: "  Shorter please " }), { kind: "post", id: M1, decision: "change", note: "Shorter please" });
  for (const bad of [null, [], "x", 5, {}, { kind: "menu" }, { kind: "x", id: M1, decision: "approve" }, { kind: "__proto__", id: M1, decision: "approve" }, { kind: "toString", id: M1, decision: "approve" }, { kind: "menu", id: "nope", decision: "approve" }, { kind: "menu", id: M1, decision: "delete" }, { kind: "menu", id: M1 }]) assert.ok(A.cleanDecision(bad).error, JSON.stringify(bad));
  assert.ok(ok("reply", "change").error);
  assert.ok(ok("reply", "change", { note: "   " }).error);
  assert.ok(ok("reply", "change", { note: "x".repeat(301) }).error);
  assert.equal(ok("reply", "change", { note: "x".repeat(300) }).error, undefined);
  assert.ok(ok("reply", "change", { note: 5 }).error);
  assert.deepEqual(A.cleanDecision({ kind: "menu", decision: "approve_all" }), { kind: "menu", decision: "approve_all" });
  assert.ok(A.cleanDecision({ kind: "post", decision: "approve_all" }).error);
  assert.ok(id);
});

test("an answer needs a real id and words, up to 1000 characters", () => {
  assert.deepEqual(A.cleanAnswer({ id: M1, answer: " Yes " }), { id: M1, answer: "Yes" });
  for (const bad of [null, [], {}, { id: M1 }, { id: M1, answer: "  " }, { id: "x", answer: "Yes" }, { id: M1, answer: 5 }, { id: M1, answer: "x".repeat(1001) }]) assert.ok(A.cleanAnswer(bad).error, JSON.stringify(bad));
  assert.equal(A.cleanAnswer({ id: M1, answer: "x".repeat(1000) }).error, undefined);
});

// ---------- approve and send back ----------

test("the owner approves a menu item, a post and a reply that are waiting", async () => {
  const m = menu(M1, "waiting"); const p = post(M1, "waiting"); const r = reply(M1, "waiting");
  assert.equal((await review({ kind: "menu", id: m.id, decision: "approve" })).status, 200);
  assert.equal((await review({ kind: "post", id: p.id, decision: "approve" })).status, 200);
  assert.equal((await review({ kind: "reply", id: r.id, decision: "approve" })).status, 200);
  assert.equal(fake.tables.sync_menu_items[0].status, "confirmed");
  assert.equal(fake.tables.sync_posts[0].status, "approved");
  assert.equal(fake.tables.sync_replies[0].status, "approved");
});

test("sending back needs a comment, keeps it for the team and moves the item back to the team's draft stage", async () => {
  const m = menu(M1, "waiting"); const p = post(M1, "waiting"); const r = reply(M1, "waiting");
  assert.equal((await review({ kind: "menu", id: m.id, decision: "change" })).status, 400);
  assert.equal(fake.tables.sync_menu_items[0].status, "waiting");
  assert.equal((await review({ kind: "menu", id: m.id, decision: "change", note: "Price is 180" })).status, 200);
  assert.equal((await review({ kind: "post", id: p.id, decision: "change", note: "Remove the offer" })).status, 200);
  assert.equal((await review({ kind: "reply", id: r.id, decision: "change", note: "Do not say sorry" })).status, 200);
  assert.deepEqual([fake.tables.sync_menu_items[0].status, fake.tables.sync_menu_items[0].owner_note], ["draft", "Price is 180"]);
  assert.deepEqual([fake.tables.sync_posts[0].status, fake.tables.sync_posts[0].owner_note], ["drafted", "Remove the offer"]);
  assert.deepEqual([fake.tables.sync_replies[0].status, fake.tables.sync_replies[0].owner_note], ["drafted", "Do not say sorry"]);
});

test("approving clears an old comment", async () => {
  const m = menu(M1, "waiting", { owner_note: "old" });
  await review({ kind: "menu", id: m.id, decision: "approve" });
  assert.equal(fake.tables.sync_menu_items[0].owner_note, null);
});

test("only something waiting for the owner can be decided: anything else is refused and left alone", async () => {
  for (const status of ["draft", "confirmed"]) { const m = menu(M1, status); assert.equal((await review({ kind: "menu", id: m.id, decision: "approve" })).status, 409, status); }
  for (const status of ["idea", "drafted", "approved", "published"]) { const p = post(M1, status); assert.equal((await review({ kind: "post", id: p.id, decision: "approve" })).status, 409, status); }
  for (const status of ["new", "asking", "drafted", "approved", "posted"]) { const r = reply(M1, status); assert.equal((await review({ kind: "reply", id: r.id, decision: "change", note: "x" })).status, 409, status); }
  assert.deepEqual(fake.tables.sync_menu_items.map((i) => i.status), ["draft", "confirmed"]);
  assert.deepEqual(fake.tables.sync_posts.map((i) => i.status), ["idea", "drafted", "approved", "published"]);
  assert.deepEqual(fake.tables.sync_replies.map((i) => i.status), ["new", "asking", "drafted", "approved", "posted"]);
  assert.ok(fake.tables.sync_replies.every((r) => r.owner_note === null));
});

test("a second decision on the same item is refused", async () => {
  const m = menu(M1, "waiting");
  assert.equal((await review({ kind: "menu", id: m.id, decision: "approve" })).status, 200);
  assert.equal((await review({ kind: "menu", id: m.id, decision: "change", note: "no" })).status, 409);
  assert.equal(fake.tables.sync_menu_items[0].status, "confirmed");
});

test("approve all confirms every waiting menu item of this business and nothing else", async () => {
  menu(M1, "waiting"); menu(M1, "waiting"); menu(M1, "draft"); menu(M1, "confirmed"); menu(M2, "waiting"); post(M1, "waiting");
  const r = await review({ kind: "menu", decision: "approve_all" });
  assert.equal(r.status, 200);
  assert.equal(r.body.changed, 2);
  assert.deepEqual(fake.tables.sync_menu_items.map((i) => i.status), ["confirmed", "confirmed", "draft", "confirmed", "waiting"]);
  assert.equal(fake.tables.sync_posts[0].status, "waiting");
});

// ---------- the question ----------

test("the owner answers while the team is asking, and may answer again", async () => {
  const r = reply(M1, "asking", { team_question: "Which table?" });
  assert.equal((await answer({ id: r.id, answer: "Table 4" })).status, 200);
  assert.deepEqual([fake.tables.sync_replies[0].status, fake.tables.sync_replies[0].owner_answer], ["asking", "Table 4"]);
  assert.ok(fake.tables.sync_replies[0].owner_answered_at);
  assert.equal((await answer({ id: r.id, answer: "Table 5" })).status, 200);
  assert.equal(fake.tables.sync_replies[0].owner_answer, "Table 5");
  assert.equal((await answer({ id: r.id, answer: "" })).status, 400);
});

test("an answer is refused unless the team is asking", async () => {
  for (const status of ["new", "drafted", "waiting", "approved", "posted"]) { const r = reply(M1, status); assert.equal((await answer({ id: r.id, answer: "x" })).status, 409, status); }
  assert.ok(fake.tables.sync_replies.every((r) => r.owner_answer === null));
});

// ---------- who may do it ----------

test("signed out gets 401; a stranger, a business with no owner and a bad id all look like nothing is there", async () => {
  const m = menu(M1, "waiting"); const r = reply(M1, "asking", { team_question: "q" });
  as(null);
  assert.equal((await review({ kind: "menu", id: m.id, decision: "approve" })).status, 401);
  assert.equal((await answer({ id: r.id, answer: "x" })).status, 401);
  as("owner_2", "user");
  assert.equal((await review({ kind: "menu", id: m.id, decision: "approve" })).status, 404);
  assert.equal((await answer({ id: r.id, answer: "x" })).status, 404);
  as("someone", "user");
  assert.equal((await review({ kind: "menu", id: m.id, decision: "approve" })).status, 404);
  as("owner_1", "user");
  assert.equal((await review({ kind: "menu", id: m.id, decision: "approve" }, "not-an-id")).status, 404);
  assert.equal((await review({ kind: "menu", id: m.id, decision: "approve" }, uuid())).status, 404);
  assert.equal(fake.tables.sync_menu_items[0].status, "waiting");
  assert.equal(fake.tables.sync_replies[0].owner_answer, null);
  assert.equal(fake.tables.admin_audit_log.length, 0);
});

test("a team admin who is not the linked owner has no way in through the owner routes", async () => {
  const m = menu(M1, "waiting");
  as("user_admin", "admin");
  assert.equal((await review({ kind: "menu", id: m.id, decision: "approve" })).status, 404);
});

test("an owner can never touch another business, even by giving that business's item id", async () => {
  const other = menu(M2, "waiting"); const op = post(M2, "waiting"); const orp = reply(M2, "asking", { team_question: "q" });
  assert.equal((await review({ kind: "menu", id: other.id, decision: "approve" })).status, 409);
  assert.equal((await review({ kind: "post", id: op.id, decision: "change", note: "x" })).status, 409);
  assert.equal((await answer({ id: orp.id, answer: "x" })).status, 409);
  assert.equal((await review({ kind: "menu", id: other.id, decision: "approve" }, M2)).status, 404);
  assert.equal((await review({ kind: "menu", decision: "approve_all" })).body.changed, 0);
  assert.equal(fake.tables.sync_menu_items[0].status, "waiting");
  assert.equal(fake.tables.sync_posts[0].status, "waiting");
  assert.equal(fake.tables.sync_replies[0].owner_answer, null);
});

test("a Free business is held; an unreadable stage never blocks", async () => {
  const m = menu(M1, "waiting");
  Object.assign(fake.tables.sync_merchants[0], { stage: "free", trial_started_on: "2026-01-01", trial_ends_on: "2026-04-01" });
  assert.equal((await review({ kind: "menu", id: m.id, decision: "approve" })).status, 409);
  assert.equal(fake.tables.sync_menu_items[0].status, "waiting");
  Object.assign(fake.tables.sync_merchants[0], { stage: undefined });
  assert.equal((await review({ kind: "menu", id: m.id, decision: "approve" })).status, 200);
});

test("bad requests change nothing and write no log entry", async () => {
  const m = menu(M1, "waiting");
  for (const body of [{}, { kind: "menu" }, { kind: "menu", id: m.id, decision: "change" }, { kind: "post", decision: "approve_all" }, [], "x"]) assert.equal((await review(body)).status, 400, JSON.stringify(body));
  const r = await reviewRoute(new Request("https://www.kastochhanepal.com/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }), { params: { id: M1 } });
  assert.equal(r.status, 400);
  assert.equal(fake.tables.sync_menu_items[0].status, "waiting");
  assert.equal(fake.tables.admin_audit_log.length, 0);
});

test("if the audit log cannot be written, nothing is changed", async () => {
  const m = menu(M1, "waiting"); const r = reply(M1, "asking", { team_question: "q" });
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await review({ kind: "menu", id: m.id, decision: "approve" })).status, 500);
  assert.equal((await review({ kind: "menu", decision: "approve_all" })).status, 500);
  assert.equal((await answer({ id: r.id, answer: "x" })).status, 500);
  fake.failWritesTo = null;
  assert.equal(fake.tables.sync_menu_items[0].status, "waiting");
  assert.equal(fake.tables.sync_replies[0].owner_answer, null);
});

test("the audit log keeps who and which one, never the comment or the answer", async () => {
  const m = menu(M1, "waiting"); const r = reply(M1, "asking", { team_question: "q" });
  await review({ kind: "menu", id: m.id, decision: "change", note: "SECRET COMMENT 77777" });
  await answer({ id: r.id, answer: "SECRET ANSWER 88888" });
  const log = JSON.stringify(fake.tables.admin_audit_log);
  for (const action of ["sync.owner.change", "sync.owner.answer"]) assert.ok(log.includes(action), action);
  assert.ok(log.includes("owner_1"));
  for (const secret of ["SECRET COMMENT", "SECRET ANSWER", "77777", "88888"]) assert.ok(!log.includes(secret), secret);
});

// ---------- what the owner is shown ----------

test("the owner's list holds only what is waiting for them, with owner-safe fields and no team words", async () => {
  menu(M1, "waiting", { name: "Momo" }); menu(M1, "draft"); menu(M2, "waiting");
  post(M1, "waiting"); post(M1, "drafted");
  reply(M1, "waiting", { draft: "Our reply" }); reply(M1, "drafted");
  reply(M1, "asking", { team_question: "Which table?" });
  const needs = await O.ownerNeeds(createServerSupabase(), "owner_1", M1);
  assert.equal(needs.menu.length, 1);
  assert.equal(needs.menu[0].name, "Momo");
  assert.equal(needs.posts.length, 1);
  assert.equal(needs.replies.length, 1);
  assert.equal(needs.questions.length, 1);
  assert.equal(needs.total, 4);
  const text = JSON.stringify(needs);
  for (const hidden of ["TEAM TITLE", "created_by", "owner_user_id", "merchant_id", "Other Cafe"]) assert.ok(!text.includes(hidden), hidden);
  assert.equal(await O.ownerNeeds(createServerSupabase(), "owner_2", M1), null);
  assert.equal(await O.ownerNeeds(createServerSupabase(), "", M1), null);
});

test("an answered question no longer counts as needing the owner, and a Free business has none", async () => {
  reply(M1, "asking", { team_question: "q", owner_answer: "done" });
  assert.equal((await O.ownerNeeds(createServerSupabase(), "owner_1", M1)).total, 0);
  menu(M1, "waiting");
  Object.assign(fake.tables.sync_merchants[0], { stage: "free", trial_started_on: "2026-01-01", trial_ends_on: "2026-04-01" });
  const free = await O.ownerNeeds(createServerSupabase(), "owner_1", M1);
  assert.equal(free.total, 0);
  assert.equal(free.menu.length, 0);
});

// ---------- the team's side ----------

test("when the team sends something to the owner again, the old comment is cleared", async () => {
  as("user_admin", "admin");
  const send = async (route, body) => { const r = await route(new Request("https://www.kastochhanepal.com/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: { id: M1 } }); return r.status; };
  const m = menu(M1, "draft", { owner_note: "old m" }); const p = post(M1, "drafted", { owner_note: "old p" }); const r = reply(M1, "drafted", { owner_note: "old r", draft: "Reply" });
  assert.equal(await send(teamMenu, { itemId: m.id, status: "waiting" }), 200);
  assert.equal(await send(teamPosts, { postId: p.id, status: "waiting" }), 200);
  assert.equal(await send(teamReplies, { replyId: r.id, status: "waiting" }), 200);
  assert.equal(fake.tables.sync_menu_items[0].owner_note, null);
  assert.equal(fake.tables.sync_posts[0].owner_note, null);
  assert.equal(fake.tables.sync_replies[0].owner_note, null);
});

test("the team cannot ask the owner without a question, and a new question clears the old answer", async () => {
  as("user_admin", "admin");
  const send = async (body) => { const r = await teamReplies(new Request("https://www.kastochhanepal.com/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: { id: M1 } }); return r.status; };
  const r = reply(M1, "drafted", { draft: "Reply" });
  assert.equal(await send({ replyId: r.id, status: "asking" }), 400);
  assert.equal(fake.tables.sync_replies[0].status, "drafted");
  assert.equal(await send({ replyId: r.id, status: "asking", team_question: "Which table?" }), 200);
  assert.equal(fake.tables.sync_replies[0].team_question, "Which table?");
  Object.assign(fake.tables.sync_replies[0], { owner_answer: "Table 4", owner_answered_at: "2026-11-18T01:00:00Z", status: "drafted" });
  assert.equal(await send({ replyId: r.id, status: "asking", team_question: "And the time?" }), 200);
  assert.equal(fake.tables.sync_replies[0].owner_answer, null);
  assert.equal(fake.tables.sync_replies[0].owner_answered_at, null);
});

// ---------- the pages and the file layout ----------

test("the owner screens call only the owner routes and the migration adds the new columns", () => {
  const screen = read("app/owner/[id]/needs-you/NeedsYou.js");
  assert.ok(screen.includes("/api/owner/merchants/") && !screen.includes("/api/admin"));
  assert.ok(!read("app/owner/[id]/needs-you/page.js").includes("created_by"));
  assert.ok(!screen.includes("alert(") && !screen.includes("confirm("));
  const sql = read("supabase/migrations/0036_sync_owner_feedback.sql");
  for (const col of ["owner_note", "team_question", "owner_answer", "owner_answered_at"]) assert.ok(sql.includes(col), col);
  assert.ok(read("docs/sync/runbook.md").includes("0036_sync_owner_feedback"));
});
