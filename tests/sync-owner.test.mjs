// Patch 8: a business's linked owner, the "Verified business" label, and the owner's reply to one post.
// The tests are about who may do what, and about one promise: a reply is never an experience. It is stored
// apart from the posts, so nothing that counts, ranks, votes on or labels experiences can ever see it.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { POST: replyPost } = await import("../app/api/sync/owner-replies/route.js");
const { PUT: replyPut, DELETE: replyDelete } = await import("../app/api/sync/owner-replies/[id]/route.js");
const { POST: lookupRoute } = await import("../app/api/admin/sync/owner-lookup/route.js");
const { PUT: linkRoute, DELETE: unlinkRoute } = await import("../app/api/admin/sync/merchants/[id]/owner/route.js");
const { POST: reviewRoute } = await import("../app/api/reviews/route.js");
const O = await import("../lib/sync/ownerReplies.js");
const { isOwnerOf, publicReply, shortDate, cleanReply, repliesForReviews, createReply, updateReply, deleteReply, getReply, ownsThread, REPLY_MAX } = O;
const { describeClerkUser, findClerkUsersByEmail } = await import("../lib/auth/clerk.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");

const fake = new FakePostgrest();
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const saved = {};
let savedConsoleError;
let logged = [];
before(async () => {
  await fake.listen();
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  savedConsoleError = console.error;
});
after(async () => {
  console.error = savedConsoleError;
  for (const key of ENV_KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  await fake.close();
});

const CLERK = {
  user_owner_a: { fullName: "Sita Shrestha", emails: [{ address: "Sita@HimalBrew.example", verified: true }] },
  user_owner_b: { fullName: "Bikash Rai", emails: [{ address: "bikash@momohub.example", verified: true }] },
  user_unverified: { fullName: "Ram Karki", emails: [{ address: "ram@example.com", verified: false }] },
  user_twin_1: { fullName: "Twin One", emails: [{ address: "twin@example.com", verified: true }] },
  user_twin_2: { fullName: "Twin Two", emails: [{ address: "twin@example.com", verified: true }] },
  user_customer: { fullName: "A Customer", emails: [{ address: "customer@example.com", verified: true }] },
  user_admin: { fullName: "Pradip", emails: [{ address: "pradip@kastochha.example", verified: true }] }
};
function as(userId, extra = {}) {
  globalThis.__KC_TEST__ = { userId, roles: userId === "user_admin" ? { user_admin: "admin" } : {}, clerkUsers: CLERK, cookies: {}, revalidatedPaths: [], ...extra };
}
beforeEach(() => {
  fake.reset();
  logged = [];
  console.error = (...args) => logged.push(args.map(String).join(" "));
  as(null);
});

const A = { id: "11111111-1111-4111-8111-111111111111", slug: "himal-brew-house", topic_slug: "himal-brew-house-jhamsikhel", thread_title: "Himal Brew House, Jhamsikhel", business_name: "Himal Brew House", area: "Jhamsikhel", business_kind: "cafe", status: "active", owner_user_id: "user_owner_a" };
const B = { id: "22222222-2222-4222-8222-222222222222", slug: "momo-hub", topic_slug: "momo-hub-pulchowk", thread_title: "Momo Hub, Pulchowk", business_name: "Momo Hub", area: "Pulchowk", business_kind: "restaurant", status: "active", owner_user_id: "user_owner_b" };
const C = { id: "33333333-3333-4333-8333-333333333333", slug: "gone-cafe", topic_slug: "gone-x", thread_title: "Gone Cafe, X", business_name: "Gone Cafe", area: "X", business_kind: "cafe", status: "cancelled", owner_user_id: "user_owner_a" };
const D = { id: "44444444-4444-4444-8444-444444444444", slug: "no-owner-cafe", topic_slug: "no-owner-x", thread_title: "No Owner Cafe, X", business_name: "No Owner Cafe", area: "X", business_kind: "cafe", status: "active", owner_user_id: null };
const P = { a1: "aaaaaaa1-0000-4000-8000-000000000001", a2: "aaaaaaa2-0000-4000-8000-000000000002", b1: "bbbbbbb1-0000-4000-8000-000000000001", c1: "ccccccc1-0000-4000-8000-000000000001", d1: "ddddddd1-0000-4000-8000-000000000001", o1: "ooooooo1-0000-4000-8000-000000000001".replace(/o/g, "e") };
const post = (id, slug, title, extra = {}) => fake.tables.reviews.push({ id, topic: title, title, topic_slug: slug, category: "Food", kind: "experience", summary: "A post.", verdict: "Ramro chha", author_name: "Someone", user_id: "u_someone", created_at: "2026-10-01T00:00:00Z", upvotes: 0, downvotes: 0, ...extra });
function seed() {
  fake.tables.sync_merchants.push({ ...A }, { ...B }, { ...C }, { ...D });
  post(P.a1, A.topic_slug, A.thread_title); post(P.a2, A.topic_slug, A.thread_title, { kind: "question", verdict: null, summary: "Is it quiet?" });
  post(P.b1, B.topic_slug, B.thread_title); post(P.c1, C.topic_slug, C.thread_title); post(P.d1, D.topic_slug, D.thread_title);
  post(P.o1, "sikko-calculator", "Sikko Calculator");
}
const replies = () => fake.tables.sync_owner_replies;
const audit = () => fake.tables.admin_audit_log;
const reviewWrites = () => fake.requests.filter((r) => r.table === "reviews" && r.method !== "GET" && r.method !== "HEAD");
const json = (url, method, body) => new Request(`https://www.kastochhanepal.com${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const reply = (body) => replyPost(json("/api/sync/owner-replies", "POST", body));
const edit = (id, body) => replyPut(json(`/api/sync/owner-replies/${id}`, "PUT", body), { params: { id } });
const remove = (id) => replyDelete(json(`/api/sync/owner-replies/${id}`, "DELETE"), { params: { id } });
const seedReply = (o = {}) => { const r = { id: "eeeeeee1-0000-4000-8000-000000000001", merchant_id: A.id, review_id: P.a1, author_user_id: "user_owner_a", body: "Thank you for coming.", created_at: "2026-10-02T00:00:00.000Z", edited_at: null, ...o }; replies().push(r); return r; };

// ---------- the rules ----------

test("only the account linked to the business is its owner, and an empty link is no one", () => {
  assert.equal(isOwnerOf({ owner_user_id: "user_owner_a" }, "user_owner_a"), true);
  for (const [m, u] of [[{ owner_user_id: "user_owner_a" }, "user_owner_b"], [{ owner_user_id: null }, null], [{ owner_user_id: null }, undefined], [{ owner_user_id: "" }, ""], [{}, "x"], [null, "x"], [undefined, "x"], [{ owner_user_id: 5 }, 5], [{ owner_user_id: "user_owner_a" }, ""], [{ owner_user_id: "user_owner_a" }, null]]) assert.equal(isOwnerOf(m, u), false, JSON.stringify([m, u]));
});

test("a browser is told what a reply says and when, and never which account wrote it", () => {
  const row = { id: "r1", review_id: "p1", author_user_id: "user_owner_a", merchant_id: "m", body: "Thanks", created_at: "2026-10-02T00:00:00Z", edited_at: undefined };
  assert.deepEqual(publicReply(row), { id: "r1", review_id: "p1", body: "Thanks", created_at: "2026-10-02T00:00:00Z", edited_at: null });
  assert.equal(publicReply(null), null);
  assert.ok(!JSON.stringify(publicReply(row)).includes("user_owner_a"));
});

test("a date is written the same by the server and the browser, whatever the visitor's locale", () => {
  assert.equal(shortDate("2026-11-04T09:30:00Z"), "4 Nov 2026");
  assert.equal(shortDate("2026-01-01T00:00:00Z"), "1 Jan 2026");
  assert.equal(shortDate("2026-12-31T23:59:59Z"), "31 Dec 2026");
  for (const bad of ["", "nope", null, undefined]) assert.equal(shortDate(bad), "");
});

test("a reply is cleaned like a private note and never cut short", () => {
  assert.equal(cleanReply("  Thank you \r\n\r\n\r\n\r\ncome again \u0007 "), "Thank you\n\ncome again");
  assert.equal(cleanReply("x".repeat(REPLY_MAX + 5)).length, REPLY_MAX + 5);
  assert.equal(REPLY_MAX, 1500);
});

// ---------- the database helpers ----------

test("a reply is stored with its business, its post and its author; a second one for the same post is refused by the database", async () => {
  seed();
  const sb = createServerSupabase();
  const r = await createReply(sb, { merchantId: A.id, reviewId: P.a1, userId: "user_owner_a", body: "Thanks!" });
  assert.deepEqual({ m: r.merchant_id, p: r.review_id, u: r.author_user_id, b: r.body }, { m: A.id, p: P.a1, u: "user_owner_a", b: "Thanks!" });
  await assert.rejects(() => createReply(sb, { merchantId: A.id, reviewId: P.a1, userId: "user_owner_a", body: "Again" }), (e) => e.code === "23505" && !/Again|duplicate/.test(e.message));
  assert.equal(replies().length, 1);
  await createReply(sb, { merchantId: A.id, reviewId: P.a2, userId: "user_owner_a", body: "A different post is fine" });
  assert.equal(replies().length, 2);
});

test("editing stamps the time and keeps everything else; deleting removes it; a missing one is found as nothing", async () => {
  seed(); const r = seedReply(); const sb = createServerSupabase();
  const updated = await updateReply(sb, r.id, "Thanks, and come again.");
  assert.equal(updated.body, "Thanks, and come again.");
  assert.ok(Math.abs(Date.parse(updated.edited_at) - Date.now()) < 5000);
  assert.deepEqual([updated.review_id, updated.author_user_id, updated.created_at], [r.review_id, r.author_user_id, r.created_at]);
  await deleteReply(sb, r.id);
  assert.equal(replies().length, 0);
  assert.equal(await getReply(sb, r.id), null);
  fake.failReadsFrom = "sync_owner_replies";
  await assert.rejects(() => getReply(sb, r.id), (e) => e.code === "XX000" || e.message === "lookup failed");
});

test("the replies for a thread's posts come back by post, in chunks, and without authors", async () => {
  seed(); const sb = createServerSupabase();
  const many = [];
  for (let i = 0; i < 230; i += 1) { const id = `fffff${String(i).padStart(3, "0")}-0000-4000-8000-000000000000`; many.push(id); if (i % 2 === 0) replies().push({ id: `eeeee${String(i).padStart(3, "0")}-0000-4000-8000-000000000000`, merchant_id: A.id, review_id: id, author_user_id: "user_owner_a", body: `reply ${i}`, created_at: "2026-10-02T00:00:00Z", edited_at: null }); }
  const out = await repliesForReviews(sb, [...many, many[0], 5, null, undefined]);
  assert.equal(Object.keys(out).length, 115);
  assert.equal(out[many[0]].body, "reply 0");
  assert.ok(!JSON.stringify(out).includes("user_owner_a"));
  assert.deepEqual(await repliesForReviews(sb, []), {});
  assert.deepEqual(await repliesForReviews(sb, undefined), {});
  fake.failReadsFrom = "sync_owner_replies";
  await assert.rejects(() => repliesForReviews(sb, [many[0]]));
});

test("an account owns a thread only through the business it is linked to; a failed lookup says no", async () => {
  seed(); const sb = createServerSupabase();
  assert.equal(await ownsThread(sb, "user_owner_a", A.topic_slug), true);
  assert.equal(await ownsThread(sb, "user_owner_a", B.topic_slug), false, "another business's thread");
  assert.equal(await ownsThread(sb, "user_owner_b", A.topic_slug), false, "another business's owner");
  assert.equal(await ownsThread(sb, "user_owner_a", C.topic_slug), false, "a business whose tag was removed");
  assert.equal(await ownsThread(sb, "user_customer", A.topic_slug), false);
  for (const [u, t] of [[null, A.topic_slug], [A.topic_slug, null], ["", ""], [undefined, undefined]]) assert.equal(await ownsThread(sb, u, t), false);
  fake.failReadsFrom = "sync_merchants";
  assert.equal(await ownsThread(sb, "user_owner_a", A.topic_slug), false, "never throws, never blocks");
});

// ---------- writing a reply ----------

test("the owner's reply is saved under the post it answers, shown as the business, and is not a post", async () => {
  seed(); as("user_owner_a");
  const before = fake.tables.reviews.length;
  const res = await reply({ reviewId: P.a1, body: "  Thank you for coming!  " });
  assert.equal(res.status, 201);
  const { reply: r } = await res.json();
  assert.deepEqual(Object.keys(r).sort(), ["body", "created_at", "edited_at", "id", "review_id"], "nothing about who wrote it");
  assert.equal(r.body, "Thank you for coming!");
  assert.equal(replies().length, 1);
  assert.deepEqual({ m: replies()[0].merchant_id, p: replies()[0].review_id, u: replies()[0].author_user_id }, { m: A.id, p: P.a1, u: "user_owner_a" });
  assert.equal(fake.tables.reviews.length, before, "no post was made");
  assert.deepEqual(reviewWrites(), [], "and nothing in the posts was touched: no count, no tally, no vote can change");
});

test("a reply can answer a question as well as an experience", async () => {
  seed(); as("user_owner_a");
  assert.equal((await reply({ reviewId: P.a2, body: "Yes, quiet until 5 pm." })).status, 201);
  assert.equal(replies()[0].review_id, P.a2);
});

test("not signed in, nothing is saved", async () => {
  seed(); as(null);
  assert.equal((await reply({ reviewId: P.a1, body: "hi" })).status, 401);
  assert.equal(replies().length, 0);
});

test("nobody but the linked owner can reply: not a customer, not another business's owner, not even an admin", async () => {
  seed();
  for (const user of ["user_customer", "user_owner_b", "user_admin", "user_unverified"]) {
    as(user);
    const res = await reply({ reviewId: P.a1, body: "I am the business" });
    assert.equal(res.status, 403, user);
    assert.match((await res.json()).error, /Only the verified owner of this business/);
  }
  assert.equal(replies().length, 0);
  as("user_owner_b");
  assert.equal((await reply({ reviewId: P.b1, body: "my own thread" })).status, 201, "each owner can reply on their own page");
  assert.equal((await reply({ reviewId: P.a1, body: "not mine" })).status, 403, "and no other");
});

test("a business with no linked owner takes no replies, from anyone", async () => {
  seed();
  for (const user of ["user_owner_a", "user_customer", "user_admin"]) { as(user); assert.equal((await reply({ reviewId: P.d1, body: "hi" })).status, 403, user); }
  assert.equal(replies().length, 0);
});

test("a post that is not on a business's page, a missing post, and a removed business's post take no reply", async () => {
  seed(); as("user_owner_a");
  assert.equal((await reply({ reviewId: P.o1, body: "hi" })).status, 404, "an ordinary thread");
  assert.equal((await reply({ reviewId: "99999999-9999-4999-8999-999999999999", body: "hi" })).status, 404, "no such post");
  assert.equal((await reply({ reviewId: P.c1, body: "hi" })).status, 404, "tag removed");
  assert.equal(replies().length, 0);
});

test("a reply cannot be replied to: only posts can be answered", async () => {
  seed(); as("user_owner_a");
  const r = seedReply();
  const res = await reply({ reviewId: r.id, body: "reply to a reply" });
  assert.equal(res.status, 404);
  assert.equal(replies().length, 1);
});

test("a bad post id, an empty reply and a too-long reply are refused with a reason", async () => {
  seed(); as("user_owner_a");
  for (const reviewId of [undefined, null, 5, "", "not-a-uuid", {}, [P.a1]]) assert.equal((await reply({ reviewId, body: "hi" })).status, 400, String(reviewId));
  for (const body of ["", "   ", "\n\n", undefined, null, 5, {}]) { const res = await reply({ reviewId: P.a1, body }); assert.equal(res.status, 400, String(body)); assert.equal((await res.json()).error, "Write your reply first."); }
  const long = await reply({ reviewId: P.a1, body: "x".repeat(REPLY_MAX + 1) });
  assert.equal(long.status, 400);
  assert.match((await long.json()).error, /at most 1,500 characters/);
  assert.equal(replies().length, 0);
  assert.equal((await reply({ reviewId: P.a1, body: "x".repeat(REPLY_MAX) })).status, 201, "exactly the limit is fine");
});

test("one reply per post: a second is refused and says to edit; a different post is still open", async () => {
  seed(); as("user_owner_a");
  assert.equal((await reply({ reviewId: P.a1, body: "First" })).status, 201);
  const second = await reply({ reviewId: P.a1, body: "Second" });
  assert.equal(second.status, 409);
  assert.match((await second.json()).error, /already replied.*Edit your reply/);
  assert.deepEqual(replies().map((r) => r.body), ["First"]);
  assert.equal((await reply({ reviewId: P.a2, body: "Another post" })).status, 201);
});

test("two replies sent at the same instant make exactly one", async () => {
  seed(); as("user_owner_a");
  const results = await Promise.all([reply({ reviewId: P.a1, body: "one" }), reply({ reviewId: P.a1, body: "two" }), reply({ reviewId: P.a1, body: "three" })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);
  assert.equal(replies().length, 1);
});

test("the reply's words and the account never reach a log, even when saving fails", async () => {
  seed(); as("user_owner_a");
  fake.failWritesTo = "sync_owner_replies";
  const res = await reply({ reviewId: P.a1, body: "MY SECRET REPLY WORDS" });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "Could not post your reply. Please try again." });
  assert.ok(!/SECRET REPLY|simulated|user_owner_a/.test(logged.join(" | ")), logged.join(" | "));
  assert.match(logged.join(" "), /error code: XX000/);
  assert.equal(replies().length, 0);
  fake.failWritesTo = null; fake.failReadsFrom = "reviews";
  assert.equal((await reply({ reviewId: P.a1, body: "hi" })).status, 500);
});

// ---------- editing and deleting ----------

test("the owner can edit their reply: the words change, the time is stamped, nothing else moves", async () => {
  seed(); const r = seedReply(); as("user_owner_a");
  const res = await edit(r.id, { body: "  Thanks, see you again!  " });
  assert.equal(res.status, 200);
  const body = (await res.json()).reply;
  assert.deepEqual([body.body, body.review_id, body.id], ["Thanks, see you again!", P.a1, r.id]);
  assert.ok(body.edited_at && Math.abs(Date.parse(body.edited_at) - Date.now()) < 5000);
  assert.equal(replies()[0].author_user_id, "user_owner_a");
  assert.equal(replies().length, 1, "edited in place, not stacked");
});

test("only the current owner can edit: not a customer, not another owner, not an admin, not a former owner", async () => {
  seed(); const r = seedReply();
  for (const user of ["user_customer", "user_owner_b", "user_admin"]) { as(user); assert.equal((await edit(r.id, { body: "changed" })).status, 403, user); }
  assert.equal(replies()[0].body, "Thank you for coming.");
  fake.tables.sync_merchants.find((m) => m.id === A.id).owner_user_id = "user_owner_b"; // the team linked someone else
  as("user_owner_a");
  assert.equal((await edit(r.id, { body: "I used to own it" })).status, 403, "a former owner has no say");
  as(null);
  assert.equal((await edit(r.id, { body: "x" })).status, 401);
});

test("an edit is validated like a new reply, and a missing or removed one is not found", async () => {
  seed(); const r = seedReply(); as("user_owner_a");
  for (const body of ["", "   ", undefined, 5]) assert.equal((await edit(r.id, { body })).status, 400);
  assert.equal((await edit(r.id, { body: "x".repeat(REPLY_MAX + 1) })).status, 400);
  assert.equal((await edit("not-a-uuid", { body: "x" })).status, 404);
  assert.equal((await edit("99999999-9999-4999-8999-999999999999", { body: "x" })).status, 404);
  fake.tables.sync_merchants.find((m) => m.id === A.id).status = "cancelled";
  assert.equal((await edit(r.id, { body: "x" })).status, 404, "tag removed");
  assert.equal(replies()[0].body, "Thank you for coming.");
});

test("the owner can delete their reply, and no one else can: a customer, another owner, a former owner", async () => {
  seed(); const r = seedReply();
  for (const user of ["user_customer", "user_owner_b"]) { as(user); assert.equal((await remove(r.id)).status, 403, user); }
  fake.tables.sync_merchants.find((m) => m.id === A.id).owner_user_id = "user_owner_b";
  as("user_owner_a"); assert.equal((await remove(r.id)).status, 403, "a former owner");
  assert.equal(replies().length, 1);
  fake.tables.sync_merchants.find((m) => m.id === A.id).owner_user_id = "user_owner_a";
  assert.equal((await remove(r.id)).status, 200);
  assert.equal(replies().length, 0);
  assert.equal(audit().length, 0, "an owner deleting their own words is not an admin action");
  as(null); assert.equal((await remove(r.id)).status, 401);
  as("user_owner_a"); assert.equal((await remove(r.id)).status, 404, "already gone");
  assert.equal((await remove("not-a-uuid")).status, 404);
});

test("a team member can remove a reply, and it is recorded: which reply, whose, never what it said", async () => {
  seed(); const r = seedReply({ body: "A SECRET BUSINESS REPLY" }); as("user_admin");
  assert.equal((await remove(r.id)).status, 200);
  assert.equal(replies().length, 0);
  assert.equal(audit().length, 1);
  assert.deepEqual({ a: audit()[0].action, s: audit()[0].status, t: audit()[0].target_type, id: audit()[0].target_id, actor: audit()[0].actor_id }, { a: "sync.owner_reply.remove", s: "applied", t: "sync_owner_reply", id: r.id, actor: "user_admin" });
  assert.ok(!/SECRET BUSINESS REPLY|user_owner_a/.test(JSON.stringify(audit())), "no words, no account");
  assert.deepEqual(Object.keys(audit()[0].before).sort(), ["id", "merchant_id", "review_id"]);
});

test("a removal that cannot be recorded does not happen, and one that fails is recorded as failed", async () => {
  seed(); const r = seedReply(); as("user_admin");
  fake.failWritesTo = "admin_audit_log";
  const blocked = await remove(r.id);
  assert.equal(blocked.status, 500);
  assert.match((await blocked.json()).error, /audit log/);
  assert.equal(replies().length, 1);
  fake.failWritesTo = "sync_owner_replies";
  assert.equal((await remove(r.id)).status, 500);
  assert.equal(audit()[audit().length - 1].status, "failed");
  assert.equal(replies().length, 1);
});

test("an admin who is also the owner deletes as the owner, with no admin record", async () => {
  seed(); fake.tables.sync_merchants.find((m) => m.id === A.id).owner_user_id = "user_admin";
  const r = seedReply({ author_user_id: "user_admin" }); as("user_admin");
  assert.equal((await remove(r.id)).status, 200);
  assert.equal(audit().length, 0);
});

test("a removed business's reply can still be removed by the team, but not by its owner", async () => {
  seed(); const r = seedReply({ merchant_id: C.id, review_id: P.c1 });
  as("user_owner_a"); assert.equal((await remove(r.id)).status, 403);
  as("user_admin"); assert.equal((await remove(r.id)).status, 200);
});

// ---------- the owner does not post experiences about their own business ----------

const EXP = (o = {}) => ({ title: A.thread_title, category: "Food", summary: "Best cafe in Nepal, honestly.", verdict: "Ramro chha", ...o });
const makePost = (body, user) => { as(user); return reviewRoute(json("/api/reviews", "POST", body)); };

test("the linked owner cannot post an experience about their own business, and is told what to do instead", async () => {
  seed();
  const res = await makePost(EXP(), "user_owner_a");
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /verified owner of this business.*Use Reply on a post/);
  assert.equal(fake.tables.reviews.filter((r) => r.summary.startsWith("Best cafe")).length, 0);
});

test("everyone else can post there, and the owner can still ask a question, and post anywhere else", async () => {
  seed();
  assert.equal((await makePost(EXP(), "user_customer")).status, 200);
  assert.equal((await makePost(EXP({ summary: "A customer of the other cafe" }), "user_owner_b")).status, 200, "another business's owner is an ordinary customer here");
  assert.equal((await makePost({ title: A.thread_title, category: "Food", kind: "question", summary: "What time do you open?" }, "user_owner_a")).status, 200, "a question is fine");
  assert.equal((await makePost({ title: "Sikko Calculator", category: "Tech & Gadgets", summary: "Battery lasts all day.", verdict: "Ramro chha" }, "user_owner_a")).status, 200, "an ordinary thread");
  assert.equal((await makePost(EXP({ title: B.thread_title, summary: "Momo at the other place" }), "user_owner_a")).status, 200, "another business's thread");
});

test("a failed lookup never blocks a post", async () => {
  seed(); fake.failReadsFrom = "sync_merchants";
  assert.equal((await makePost(EXP({ summary: "lookup down" }), "user_owner_a")).status, 200);
});

// ---------- linking an owner ----------

const lookup = (body) => lookupRoute(json("/api/admin/sync/owner-lookup", "POST", body));
const link = (id, body) => linkRoute(json(`/api/admin/sync/merchants/${id}/owner`, "PUT", body), { params: { id } });
const unlink = (id) => unlinkRoute(json(`/api/admin/sync/merchants/${id}/owner`, "DELETE"), { params: { id } });
const merchantRow = (m) => fake.tables.sync_merchants.find((x) => x.id === m.id);

test("only an admin can look up or link an owner", async () => {
  seed();
  for (const user of [null, "user_customer", "user_owner_a"]) {
    as(user); const expected = user ? 403 : 401;
    assert.equal((await lookup({ email: "sita@himalbrew.example" })).status, expected, String(user));
    assert.equal((await link(D.id, { userId: "user_customer" })).status, expected, String(user));
    assert.equal((await unlink(A.id)).status, expected, String(user));
  }
  assert.equal(merchantRow(D).owner_user_id, null);
  assert.equal(merchantRow(A).owner_user_id, "user_owner_a");
  assert.equal(audit().length, 0);
});

test("looking an account up by email shows the team who it is, and nothing more", async () => {
  seed(); as("user_admin");
  for (const email of ["sita@himalbrew.example", "  SITA@HIMALBREW.EXAMPLE ", "Sita@HimalBrew.example"]) {
    const res = await lookup({ email });
    assert.equal(res.status, 200, email);
    assert.deepEqual((await res.json()).user, { id: "user_owner_a", name: "Sita Shrestha", email: "Sita@HimalBrew.example", verified: true });
  }
  const unverified = await (await lookup({ email: "ram@example.com" })).json();
  assert.equal(unverified.user.verified, false, "an unverified email is said to be unverified");
  assert.equal(audit().length, 0, "looking is not changing");
});

test("a bad email, an unknown email, two accounts on one email, and a sign-in service that is down are each answered plainly", async () => {
  seed(); as("user_admin");
  for (const email of ["", "   ", "nope", "a@b", "a b@c.com", undefined, null, 5, {}, "x".repeat(250) + "@example.com"]) assert.equal((await lookup({ email })).status, 400, String(email).slice(0, 20));
  const none = await lookup({ email: "nobody@example.com" });
  assert.equal(none.status, 404);
  assert.match((await none.json()).error, /No KastoChha account uses that email/);
  assert.equal((await lookup({ email: "twin@example.com" })).status, 409);
  as("user_admin", { clerkDown: true });
  const down = await lookup({ email: "sita@himalbrew.example" });
  assert.equal(down.status, 502);
  assert.ok(!/Clerk is down/.test(JSON.stringify(await down.json())), "the service's own message is not passed on");
});

test("an admin can link an account to a business, and it is recorded by account id only", async () => {
  seed(); as("user_admin");
  const res = await link(D.id, { userId: "user_owner_a" });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).owner, { id: "user_owner_a", name: "Sita Shrestha", email: "Sita@HimalBrew.example", verified: true });
  assert.equal(merchantRow(D).owner_user_id, "user_owner_a");
  assert.equal(audit().length, 1);
  assert.deepEqual({ a: audit()[0].action, s: audit()[0].status, t: audit()[0].target_type, id: audit()[0].target_id, b: audit()[0].before, af: audit()[0].after }, { a: "sync.owner.link", s: "applied", t: "sync_merchant", id: D.id, b: { owner_user_id: null }, af: { owner_user_id: "user_owner_a" } });
  assert.ok(!/sita|Sita|himalbrew|Shrestha/.test(JSON.stringify(audit())), "no name or email in the log");
});

test("replacing an owner is one recorded change, and the old owner loses the right to reply at once", async () => {
  seed(); const r = seedReply();
  as("user_owner_a"); assert.equal((await reply({ reviewId: P.a2, body: "I can reply" })).status, 201);
  as("user_admin");
  assert.equal((await link(A.id, { userId: "user_owner_b" })).status, 200);
  assert.deepEqual([audit()[0].before.owner_user_id, audit()[0].after.owner_user_id], ["user_owner_a", "user_owner_b"]);
  as("user_owner_a");
  assert.equal((await reply({ reviewId: P.a1, body: "too late" })).status, 403);
  assert.equal((await edit(r.id, { body: "too late" })).status, 403);
  as("user_owner_b");
  assert.equal((await edit(r.id, { body: "the new owner edits what the business said" })).status, 200, "the replies are the business's, not one person's");
});

test("linking the same account again changes and records nothing", async () => {
  seed(); as("user_admin");
  assert.equal((await link(A.id, { userId: "user_owner_a" })).status, 200);
  assert.equal(audit().length, 0);
});

test("an account that is unknown, has an unverified email, or is not an account is refused", async () => {
  seed(); as("user_admin");
  for (const userId of [undefined, null, "", 5, {}, "x", "a b c d e", "user/../x", "u".repeat(101)]) assert.equal((await link(D.id, { userId })).status, 400, String(userId));
  assert.equal((await link(D.id, { userId: "user_nobody_at_all" })).status, 404);
  const unverified = await link(D.id, { userId: "user_unverified" });
  assert.equal(unverified.status, 409);
  assert.match((await unverified.json()).error, /has not been verified/);
  assert.equal(merchantRow(D).owner_user_id, null);
  assert.equal(audit().length, 0);
});

test("only a business that exists and still has its tag can be given an owner", async () => {
  seed(); as("user_admin");
  assert.equal((await link("not-a-uuid", { userId: "user_owner_a" })).status, 400);
  assert.equal((await link("99999999-9999-4999-8999-999999999999", { userId: "user_owner_a" })).status, 404);
  const gone = await link(C.id, { userId: "user_owner_b" });
  assert.equal(gone.status, 409);
  assert.match((await gone.json()).error, /tag was removed/);
  assert.equal(merchantRow(C).owner_user_id, "user_owner_a");
});

test("unlinking removes the right to reply, is recorded, and unlinking nobody is a quiet no-op", async () => {
  seed(); as("user_admin");
  const res = await unlink(A.id);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { owner: null });
  assert.equal(merchantRow(A).owner_user_id, null);
  assert.deepEqual({ a: audit()[0].action, b: audit()[0].before, af: audit()[0].after }, { a: "sync.owner.unlink", b: { owner_user_id: "user_owner_a" }, af: { owner_user_id: null } });
  as("user_owner_a"); assert.equal((await reply({ reviewId: P.a1, body: "hi" })).status, 403);
  as("user_admin");
  assert.equal((await unlink(A.id)).status, 200);
  assert.equal(audit().length, 1, "nothing was linked, so nothing changed");
  assert.equal((await unlink("not-a-uuid")).status, 400);
  assert.equal((await unlink("99999999-9999-4999-8999-999999999999")).status, 404);
});

test("if the change cannot be recorded it does not happen; a failed save is recorded as failed", async () => {
  seed(); as("user_admin");
  fake.failWritesTo = "admin_audit_log";
  const blocked = await link(D.id, { userId: "user_owner_a" });
  assert.equal(blocked.status, 500);
  assert.match((await blocked.json()).error, /audit log/);
  assert.equal(merchantRow(D).owner_user_id, null);
  assert.equal((await unlink(A.id)).status, 500);
  assert.equal(merchantRow(A).owner_user_id, "user_owner_a");
  fake.failWritesTo = "sync_merchants";
  assert.equal((await link(D.id, { userId: "user_owner_a" })).status, 500);
  assert.equal(audit()[audit().length - 1].status, "failed");
  assert.equal(merchantRow(D).owner_user_id, null);
  assert.ok(!/sita|Sita|himalbrew|Shrestha/.test(JSON.stringify(audit())), "not even a failed entry keeps a name or an email");
});

test("the owner link cannot be set any other way: not by editing the business, not by the public", () => {
  const edit = fs.readFileSync("app/api/admin/sync/merchants/[id]/route.js", "utf8");
  assert.ok(!/owner_user_id/.test(edit), "the business editor does not touch the owner");
  const routes = ["app/api/sync/owner-replies/route.js", "app/api/sync/owner-replies/[id]/route.js"].map((f) => fs.readFileSync(f, "utf8"));
  for (const source of routes) assert.ok(!/update\(\{[^}]*owner_user_id/.test(source), "a reply route never changes who the owner is");
});

test("the Clerk helpers describe an account without its private details", async () => {
  as("user_admin");
  const found = await findClerkUsersByEmail("sita@himalbrew.example");
  assert.equal(found.length, 1);
  assert.deepEqual(Object.keys(describeClerkUser(found[0])).sort(), ["email", "id", "name", "verified"]);
  assert.deepEqual(describeClerkUser({ id: "u", emailAddresses: [] }), { id: "u", name: "(no name)", email: "", verified: false });
  assert.deepEqual(await findClerkUsersByEmail("nobody@example.com"), []);
});

// ---------- guards on the screens and the wiring ----------

const read = (file) => fs.readFileSync(file, "utf8");

test("the account that owns a business never reaches a browser: not in the page's props, not in a reply", () => {
  for (const file of ["app/discussions/[slug]/page.js", "app/discussions/[slug]/ThreadClient.js", "app/components/OwnerReply.js", "app/components/TopicThread.js"]) {
    assert.ok(!/owner_user_id|author_user_id/.test(read(file)), file);
  }
  const page = read("app/discussions/[slug]/page.js");
  assert.match(page, /canReplyAsOwner = isOwnerOf\(merchant, userId\)/);
  assert.match(page, /ownerName=\{biz\.name\}/);
  assert.match(page, /if \(userId && !canReplyAsOwner\) canModerate = \(await requireRole\(ROLE\.ADMIN\)\)\.ok;/);
  assert.match(page, /catch \{\s*ownerReplies = \{\};/, "a reply that cannot be read never breaks the page");
});

test("an ordinary thread is untouched: the card gets no reply machinery unless a business asked for it", () => {
  const client = read("app/discussions/[slug]/ThreadClient.js");
  assert.match(client, /const ownerThread = ownerName\s*\?/);
  assert.match(client, /: null;/);
  const card = read("app/components/TopicThread.js");
  assert.match(card, /ownerThread = null/);
  assert.match(card, /\{ownerThread \? <OwnerReplyBlock exp=\{exp\} ownerThread=\{ownerThread\} \/> : null\}/);
  assert.match(client, /credentials: "include"/);
});

test("the reply block: the label, who sees which buttons, and nothing a stranger can press", () => {
  const block = read("app/components/OwnerReply.js");
  assert.match(block, /^"use client";/);
  assert.match(block, />Verified business</);
  assert.match(block, /Written by the account the KastoChha team linked to this business\./);
  assert.match(block, /if \(!reply && !canReply\) return null;/, "no reply and no right to write one: nothing at all");
  assert.match(block, /canReply && mode === "idle"/);
  assert.match(block, /!canReply && canModerate && mode === "idle"/);
  assert.match(block, /maxLength=\{REPLY_MAX\}/);
  assert.ok(!/supabase|node:crypto|lib\/sync\/(merchants|qr|hubToken)|dangerouslySetInnerHTML/.test(block));
  assert.match(read("app/components/ownerReply.css"), /\.owner-reply-badge/);
});

test("the admin panel links in two steps, and says what an owner can and cannot do", () => {
  const panel = read("app/admin/sync/[id]/OwnerPanel.js");
  assert.match(panel, /\/api\/admin\/sync\/owner-lookup/);
  assert.match(panel, /disabled=\{busy \|\| !found\.verified\}/);
  assert.match(panel, /they cannot post experiences about their own business/);
  assert.match(panel, /Unlink this owner\?/);
  const page = read("app/admin/sync/[id]/page.js");
  assert.match(page, /owner = \{ unreadable: true \}/, "a linked account that cannot be read is still shown as linked");
  assert.ok(page.indexOf("<OwnerPanel") < page.indexOf("<BadgePanel"));
});

test("the reply routes check who is asking on the server, and limit how fast", () => {
  for (const file of ["app/api/sync/owner-replies/route.js", "app/api/sync/owner-replies/[id]/route.js"]) {
    const source = read(file);
    assert.match(source, /await auth\(\)/, file);
    assert.match(source, /isOwnerOf\(merchant, userId\)/, file);
  }
  assert.match(read("app/api/sync/owner-replies/route.js"), /checkRateLimit\("write", userId\)/);
  assert.match(read("app/api/sync/owner-replies/[id]/route.js"), /checkRateLimit\("write", userId\)/);
});

test("the migration keeps replies apart from posts, one per post, and away from the public roles", () => {
  const sql = read("supabase/migrations/0023_sync_owner_replies.sql");
  assert.match(sql, /create table if not exists public\.sync_owner_replies/);
  assert.match(sql, /review_id uuid not null references public\.reviews \(id\) on delete cascade/);
  assert.match(sql, /merchant_id uuid not null references public\.sync_merchants \(id\) on delete cascade/);
  assert.match(sql, /constraint sync_owner_replies_review_id_key unique \(review_id\)/);
  assert.match(sql, /char_length\(body\) between 1 and 1500/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.sync_owner_replies from anon, authenticated/);
  assert.ok(!/alter table public\.reviews|alter table reviews/i.test(sql), "the posts table is not touched at all");
});

test("nothing that counts or ranks experiences reads the replies", () => {
  const readers = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = `${dir}/${e.name}`; if (e.isDirectory()) { if (!["node_modules", ".next", ".git"].includes(e.name)) walk(f); } else if (/\.(js|mjs)$/.test(e.name) && !f.startsWith("tests/") && /sync_owner_replies/.test(read(f))) readers.push(f); } };
  walk("app"); walk("lib");
  assert.deepEqual(readers.sort(), ["lib/sync/ownerReplies.js"], "only the reply helpers ever name the table; every route goes through them");
});

test("a business lookup that FAILS is an error, never 'not found': a reply is not lost behind a wrong answer", async () => {
  seed(); const r = seedReply(); as("user_owner_a");
  fake.failReadsFrom = "sync_merchants";
  assert.equal((await edit(r.id, { body: "x" })).status, 500);
  assert.equal((await remove(r.id)).status, 500);
  assert.equal(replies()[0].body, "Thank you for coming.");
  as("user_admin");
  assert.equal((await link(D.id, { userId: "user_owner_a" })).status, 500);
  assert.equal((await unlink(A.id)).status, 500);
  fake.failReadsFrom = null;
  assert.equal(merchantRow(A).owner_user_id, "user_owner_a", "nothing changed");
  assert.equal(audit().length, 0);
});

// ---------- questions are shown (a defect found while building this: they were saved and never displayed) ----------

test("the thread card never draws a question as a row, so a business page shows its questions itself", () => {
  const card = read("app/components/TopicThread.js");
  assert.match(card, /ordered\.filter\(\(exp\) => exp\.kind !== "question"\)/, "the reason the section exists: the card hides question rows");
  const client = read("app/discussions/[slug]/ThreadClient.js");
  assert.match(client, /questions=\{items\.filter\(\(item\) => item\.kind === "question"\)\}/);
  assert.match(client, /businessName=\{ownerName\}/);
  assert.ok(client.indexOf("<BusinessQuestions") < client.indexOf("{thread}"), "questions above the thread");
});

test("a business page remounts its thread when its posts change, so a question just asked appears after the refresh", () => {
  const page = read("app/discussions/[slug]/page.js");
  assert.match(page, /key=\{thread\.map\(\(post\) => post\.id\)\.join\(","\)\}/);
});

test("the questions section: the question's own words, who asked and when, the business's reply under it, and delete only for the asker", () => {
  const src = read("app/discussions/[slug]/BusinessQuestions.js");
  assert.match(src, /^"use client";/);
  assert.match(src, /className="biz-question-text">\{q\.summary\}/);
  assert.match(src, /<OwnerReplyBlock exp=\{q\} ownerThread=\{ownerThread\} \/>/);
  assert.match(src, /const mine = q\.mine === true;/, "delete shows only on the asker's own question: the server says which questions are the viewer's (patch 12)");
  assert.match(src, /\{mine \? \(/);
  assert.match(src, /if \(!questions\.length\) return null;/);
  assert.ok(!/dangerouslySetInnerHTML|supabase|owner_user_id|author_user_id/.test(src));
  assert.match(read("app/discussions/[slug]/business.css"), /\.biz-question-text/);
});

test("the Ask box says who answers: the business here, and people who have been below", () => {
  assert.match(read("app/discussions/[slug]/AskComposer.js"), /The business can reply here, and people who have been can share what they know below\./);
});
