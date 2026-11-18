// Patch 14j: the replies queue, typed in by hand.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const R = await import("../lib/sync/replies.js");
const { POST: postRoute, PATCH: patchRoute, DELETE: deleteRoute } = await import("../app/api/admin/sync/merchants/[id]/replies/route.js");
const read = (file) => fs.readFileSync(file, "utf8");

// ---------- the rules ----------

test("a review needs the reviewer's name; stars, words, day and status are checked", () => {
  assert.ok(R.cleanReply({}).error);
  assert.ok(R.cleanReply({ reviewer: "  " }).error);
  assert.ok(R.cleanReply({ reviewer: "x".repeat(81) }).error);
  for (const stars of ["0", "6", "4.5", "abc", "-1"]) assert.ok(R.cleanReply({ reviewer: "a", stars }).error, stars);
  assert.ok(R.cleanReply({ reviewer: "a", review: "x".repeat(1501) }).error);
  assert.ok(R.cleanReply({ reviewer: "a", draft: "x".repeat(4001) }).error);
  assert.ok(R.cleanReply({ reviewer: "a", status: "done" }).error);
  assert.ok(R.cleanReply({ reviewer: "a", review_on: "2026-02-30" }).error);
  assert.ok(R.cleanReply(null).error && R.cleanReply([1]).error);
  assert.deepEqual(R.cleanReply({ reviewer: " Sita R. ", stars: "2", review: "Cold coffee", review_on: "2026-11-10", draft: "" }).values, { reviewer: "Sita R.", stars: 2, review: "Cold coffee", review_on: "2026-11-10", draft: "" });
  assert.equal(R.cleanReply({ reviewer: "a", stars: "" }).values.stars, null);
  assert.equal(R.cleanReply({ reviewer: "a", stars: 5 }).values.stars, 5);
});

test("an edit changes only what it names, and an empty edit is refused", () => {
  assert.deepEqual(R.cleanReply({ status: "asking" }, { partial: true }).values, { status: "asking" });
  assert.ok(R.cleanReply({}, { partial: true }).error);
  assert.ok(R.cleanReply({ reviewer: "" }, { partial: true }).error);
});

test("a reply going to the owner, approved or posted must have words; asking the owner needs none", () => {
  for (const status of ["waiting", "approved", "posted"]) { assert.ok(R.checkFinal({ status, draft: "" })); assert.ok(R.checkFinal({ status, draft: "  " })); assert.equal(R.checkFinal({ status, draft: "Thanks" }), null); }
  for (const status of ["new", "asking", "drafted"]) assert.equal(R.checkFinal({ status, draft: "" }), null);
});

test("the queue shows the oldest unanswered review first, undated last, and posted ones at the end", () => {
  const rows = [
    { id: "a", status: "new", review_on: null, created_at: "1" },
    { id: "b", status: "drafted", review_on: "2026-11-12", created_at: "2" },
    { id: "c", status: "posted", posted_on: "2026-11-01", review_on: "2026-10-30", created_at: "3" },
    { id: "d", status: "asking", review_on: "2026-11-05", created_at: "4" },
    { id: "e", status: "posted", posted_on: "2026-11-10", review_on: null, created_at: "5" }
  ];
  assert.deepEqual(R.sortReplies(rows).map((r) => r.id), ["d", "b", "a", "e", "c"]);
});

// ---------- the routes ----------

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
const as = (userId, role) => { globalThis.__KC_TEST__ = { userId, roles: userId ? { [userId]: role } : {}, cookies: {}, revalidatedPaths: [] }; };
const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const seed = (id = ID, extra = {}) => fake.tables.sync_merchants.push({ id, slug: `b-${id.slice(0, 4)}`, topic_slug: `t-${id.slice(0, 4)}`, business_name: "Himal Brew House", area: "Jhamsikhel", status: "active", ...extra });
beforeEach(() => { fake.reset(); as("user_admin", "admin"); seed(); });
const send = async (route, method, b, id = ID, query = "") => { const r = await route(new Request(`https://www.kastochhanepal.com/x${query}`, { method, headers: { "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) }), { params: { id } }); return { status: r.status, body: await r.json() }; };
const create = (b = { reviewer: "Sita Rai", stars: "2", review: "The coffee was cold", review_on: "2026-11-10" }, id) => send(postRoute, "POST", b, id);
const patch = (b, id) => send(patchRoute, "PATCH", b, id);
const del = (reply, id) => send(deleteRoute, "DELETE", undefined, id, `?reply=${reply}`);
const rows = () => fake.tables.sync_replies;

test("an admin adds a review; it starts as New and records who added it", async () => {
  const r = await create();
  assert.equal(r.status, 200);
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].status, "new");
  assert.equal(rows()[0].stars, 2);
  assert.equal(rows()[0].created_by, "user_admin");
  assert.equal(rows()[0].merchant_id, ID);
  assert.equal(r.body.id, rows()[0].id);
});

test("a reply moves along, asking the owner needs no words, posting records the day, and moving back clears it", async () => {
  const { body } = await create();
  assert.equal((await patch({ replyId: body.id, status: "asking" })).status, 200);
  assert.equal((await patch({ replyId: body.id, status: "drafted", draft: "Sorry about the coffee, Sita." })).status, 200);
  for (const status of ["waiting", "approved"]) assert.equal((await patch({ replyId: body.id, status })).status, 200);
  assert.equal(rows()[0].posted_on ?? null, null);
  assert.equal((await patch({ replyId: body.id, status: "posted" })).status, 200);
  assert.match(rows()[0].posted_on, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await patch({ replyId: body.id, status: "new" })).status, 200);
  assert.equal(rows()[0].posted_on, null);
});

test("a reply with no words cannot go to the owner, be approved or posted", async () => {
  const { body } = await create();
  for (const status of ["waiting", "approved", "posted"]) assert.equal((await patch({ replyId: body.id, status })).status, 400, status);
  assert.equal(rows()[0].status, "new");
  assert.equal((await patch({ replyId: body.id, draft: "Thank you", status: "waiting" })).status, 200);
  assert.equal((await create({ reviewer: "x", status: "posted" })).status, 400);
});

test("an edit keeps the other fields", async () => {
  const { body } = await create();
  await patch({ replyId: body.id, draft: "Our reply" });
  assert.equal(rows()[0].draft, "Our reply");
  assert.equal(rows()[0].reviewer, "Sita Rai");
  assert.equal(rows()[0].review, "The coffee was cold");
});

test("a reply of another business is never touched", async () => {
  seed(OTHER);
  const { body } = await create(undefined, OTHER);
  assert.equal((await patch({ replyId: body.id, status: "asking" })).status, 404);
  assert.equal((await del(body.id)).status, 404);
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].status, "new");
});

test("the audit log keeps ids and status, never a reviewer's name, the review or our words", async () => {
  const { body } = await create({ reviewer: "Secret Reviewer", review: "Private review words" });
  await patch({ replyId: body.id, status: "drafted", draft: "Hidden reply words", reviewer: "Renamed Person" });
  await del(body.id);
  const log = JSON.stringify(fake.tables.admin_audit_log);
  for (const action of ["sync.replies.create", "sync.replies.update", "sync.replies.delete"]) assert.ok(log.includes(action), action);
  for (const secret of ["Secret Reviewer", "Private review", "Hidden reply", "Renamed"]) assert.ok(!log.includes(secret), secret);
});

test("a bad request changes nothing and writes no log entry", async () => {
  for (const bad of [{ reviewer: "" }, { reviewer: "a", stars: "9" }, { reviewer: "a", review_on: "nope" }, { reviewer: "a", status: "x" }]) assert.equal((await create(bad)).status, 400, JSON.stringify(bad));
  assert.equal((await patch({ replyId: "nope", status: "asking" })).status, 400);
  assert.equal((await del("nope")).status, 400);
  assert.equal(rows().length, 0);
  assert.equal(fake.tables.admin_audit_log.length, 0);
  assert.equal((await create(undefined, "not-a-uuid")).status, 400);
  assert.equal((await create(undefined, OTHER)).status, 404);
});

test("if the audit log cannot be written, nothing is saved, changed or removed", async () => {
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await create()).status, 500);
  fake.failWritesTo = null;
  assert.equal(rows().length, 0);
  const { body } = await create();
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await patch({ replyId: body.id, status: "asking" })).status, 500);
  assert.equal((await del(body.id)).status, 500);
  fake.failWritesTo = null;
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].status, "new");
});

test("signed out and ordinary users are refused", async () => {
  const { body } = await create();
  for (const [who, role, status] of [[null, null, 401], ["user_c", "user", 403]]) {
    as(who, role);
    assert.equal((await create()).status, status);
    assert.equal((await patch({ replyId: body.id, status: "asking" })).status, status);
    assert.equal((await del(body.id)).status, status);
  }
  assert.equal(rows().length, 1);
});

test("an operator works only on an assigned business; an unassigned one looks like it does not exist", async () => {
  const { body } = await create();
  as("user_op", "operator");
  assert.equal((await create()).status, 404);
  assert.equal((await patch({ replyId: body.id, status: "asking" })).status, 404);
  assert.equal((await del(body.id)).status, 404);
  fake.tables.sync_operator_assignments.push({ operator_user_id: "user_op", merchant_id: ID });
  assert.equal((await create()).status, 200);
  assert.equal((await patch({ replyId: body.id, status: "asking" })).status, 200);
  assert.equal((await del(body.id)).status, 200);
});

test("a Free business cannot get new reviews or changes, but its replies can be removed; an unreadable stage never blocks", async () => {
  const { body } = await create();
  Object.assign(fake.tables.sync_merchants[0], { stage: "free", trial_started_on: "2026-01-01", trial_ends_on: "2026-04-01" });
  const r = await create();
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Free plan/);
  assert.equal((await patch({ replyId: body.id, status: "asking" })).status, 409);
  assert.equal(rows().length, 1);
  assert.equal((await del(body.id)).status, 200);
  assert.equal(rows().length, 0);
  fake.reset(); as("user_admin", "admin"); seed();
  assert.equal((await create()).status, 200, "no stage row: not blocked");
});

// ---------- the screen and the files ----------

test("the Google tab summarises replies and opens the full view; the panel asks twice before removing and uses no dialogs", () => {
  const page = read("app/admin/sync/[id]/page.js");
  assert.match(page, /view=replies/);
  assert.match(page, /Has migration 0033 been run\?/);
  const client = read("app/admin/sync/[id]/RepliesPanel.js");
  for (const text of ["Really remove", "Copy for Google", "Mark as posted", "Send for the owner", "Ask the owner"]) assert.match(client, new RegExp(text), text);
  assert.ok(!/window\.(confirm|alert|prompt)/.test(client));
  assert.ok(!/dangerouslySetInnerHTML/.test(client));
  assert.ok(!/<nav[\s>]/.test(client));
});

test("the migration adds one private table tied to its business and is safe to replay", () => {
  const sql = read("supabase/migrations/0033_sync_replies.sql").replace(/--.*$/gm, "");
  assert.match(sql, /create table if not exists public\.sync_replies/i);
  assert.match(sql, /references public\.sync_merchants\(id\) on delete cascade/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.sync_replies from anon, authenticated/i);
  assert.ok(!/drop\s|delete\s+from|truncate/i.test(sql));
  const book = read("docs/sync/runbook.md");
  assert.match(book, /0033_sync_replies\.sql/);
  assert.match(book, /### Replies/);
});
