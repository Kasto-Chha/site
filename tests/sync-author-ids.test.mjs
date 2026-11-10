// Patch 12: no one's account id goes to anyone's browser (security test finding I4). The server answers "is this post
// yours?" and "was it written by whoever opened the thread?" and sends the answer, not the id.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { publicPost, publicPosts, newPostByOpener } = await import("../lib/publicPosts.js");
const { POST: postRoute } = await import("../app/api/reviews/route.js");
const { PATCH: patchRoute } = await import("../app/api/reviews/[id]/route.js");
const { GET: loadMore } = await import("../app/api/discussions/page/route.js");
const { getHomeData } = await import("../lib/supabase/queries.js");

const SECRETS = ["user_alice_SECRET", "user_bob_SECRET", "user_carol_SECRET"];
const row = (o) => ({ id: o.id, topic: o.topic_slug, topic_slug: o.topic_slug, title: o.topic_slug, category: "Food", kind: o.kind || "experience", summary: o.summary || `post ${o.id}`, verdict: "Ramro chha", upvotes: 0, downvotes: 0, author_name: o.name || "Someone", created_at: o.at, updated_at: null, source: null, user_id: o.user_id });

// ---------- the helper ----------

test("no post leaves the server with an account id; each says whether it is the viewer's, and whether it is the opener's", () => {
  const rows = [
    row({ id: "1", topic_slug: "t", user_id: "user_alice_SECRET", at: "2026-11-01T00:00:00Z" }),
    row({ id: "2", topic_slug: "t", user_id: "user_bob_SECRET", at: "2026-11-02T00:00:00Z" }),
    row({ id: "3", topic_slug: "t", user_id: "user_alice_SECRET", at: "2026-11-03T00:00:00Z" })
  ];
  const out = publicPosts(rows, "user_bob_SECRET");
  assert.ok(out.every((post) => !("user_id" in post)));
  assert.doesNotMatch(JSON.stringify(out), /_SECRET/);
  assert.deepEqual(out.map((post) => post.mine), [false, true, false]);
  assert.deepEqual(out.map((post) => post.by_op), [true, false, true], "alice opened the thread, so her two posts are the opener's");
});

test("signed out, nothing is yours; the opener is still marked; rows with no account are never anyone's", () => {
  const rows = [row({ id: "1", topic_slug: "t", user_id: "user_alice_SECRET", at: "2026-11-01T00:00:00Z" }), row({ id: "2", topic_slug: "t", user_id: null, at: "2026-11-02T00:00:00Z" }), row({ id: "3", topic_slug: "t", user_id: "user_alice_SECRET", at: "2026-11-03T00:00:00Z" })];
  for (const viewer of [null, undefined, ""]) assert.deepEqual(publicPosts(rows, viewer).map((post) => post.mine), [false, false, false]);
  assert.deepEqual(publicPosts(rows, "user_alice_SECRET").map((post) => post.mine), [true, false, true], "a row with no account is not matched by a viewer");
  assert.deepEqual(publicPosts(rows, null).map((post) => post.by_op), [true, false, true]);
  const old = publicPosts([row({ id: "1", topic_slug: "t", user_id: null, at: "2026-11-01T00:00:00Z" }), row({ id: "2", topic_slug: "t", user_id: null, at: "2026-11-02T00:00:00Z" })], "user_x");
  assert.deepEqual(old.map((post) => post.by_op), [false, false], "two posts with no account are not the same person");
});

test("the opener is the author of the oldest post, whatever order the rows arrive in, and each thread has its own", () => {
  const rows = [
    row({ id: "a3", topic_slug: "a", user_id: "user_carol_SECRET", at: "2026-11-05T00:00:00Z" }),
    row({ id: "b1", topic_slug: "b", user_id: "user_carol_SECRET", at: "2026-11-02T00:00:00Z" }),
    row({ id: "a1", topic_slug: "a", user_id: "user_alice_SECRET", at: "2026-11-01T00:00:00Z" }),
    row({ id: "b2", topic_slug: "b", user_id: "user_alice_SECRET", at: "2026-11-03T00:00:00Z" }),
    row({ id: "a2", topic_slug: "a", user_id: "user_alice_SECRET", at: "2026-11-02T00:00:00Z", kind: "question" })
  ];
  const by = Object.fromEntries(publicPosts(rows, null).map((post) => [post.id, post.by_op]));
  assert.deepEqual(by, { a3: false, b1: true, a1: true, b2: false, a2: true }, "a question that opened a thread makes its author the opener");
});

test("the helper does not change the rows it is given, and copes with nothing", () => {
  const rows = [row({ id: "1", topic_slug: "t", user_id: "user_alice_SECRET", at: "2026-11-01T00:00:00Z" })];
  const snapshot = JSON.stringify(rows);
  publicPosts(rows, "user_alice_SECRET");
  assert.equal(JSON.stringify(rows), snapshot);
  assert.deepEqual(publicPosts(undefined, "x"), []);
  assert.deepEqual(publicPosts([], "x"), []);
  assert.equal(publicPost(null, "x"), null);
  assert.equal(publicPost(rows[0], "user_alice_SECRET").mine, true);
  assert.equal("by_op" in publicPost(rows[0], "user_alice_SECRET"), false, "one post does not know its thread");
});

test("a post the viewer has just made is the opener's when the thread is new or the viewer opened it", () => {
  assert.equal(newPostByOpener([]), true);
  assert.equal(newPostByOpener(undefined), true);
  const mine = { created_at: "2026-11-01T00:00:00Z", mine: true }; const theirs = { created_at: "2026-11-02T00:00:00Z", mine: false };
  const later = { created_at: "2026-11-05T00:00:00Z", mine: false };
  assert.equal(newPostByOpener([later, mine]), true, "my post is the oldest, in any order");
  assert.equal(newPostByOpener([mine, later, theirs].reverse()), true);
  assert.equal(newPostByOpener([theirs, { created_at: "2026-11-09T00:00:00Z", mine: true }]), false);
});

test("a question asked by the business's own account is marked from_business (patch 11b); nothing else is, and the account never leaves the server", () => {
  const OWNER = "user_alice_SECRET";
  const rows = [
    row({ id: "q1", topic_slug: "t", kind: "question", user_id: OWNER, at: "2026-11-01T00:00:00Z" }),
    row({ id: "q2", topic_slug: "t", kind: "question", user_id: "user_bob_SECRET", at: "2026-11-02T00:00:00Z" }),
    row({ id: "e1", topic_slug: "t", kind: "experience", user_id: OWNER, at: "2026-11-03T00:00:00Z" }),
    row({ id: "q3", topic_slug: "t", kind: "question", user_id: null, at: "2026-11-04T00:00:00Z" })
  ];
  const out = Object.fromEntries(publicPosts(rows, "user_bob_SECRET", { businessOwnerId: OWNER }).map((post) => [post.id, post.from_business]));
  assert.deepEqual(out, { q1: true, q2: false, e1: false, q3: false }, "only a question from the owner's account; an old experience from that account is not relabelled");
  assert.doesNotMatch(JSON.stringify(publicPosts(rows, "user_bob_SECRET", { businessOwnerId: OWNER })), /_SECRET/);
  for (const none of [undefined, null, ""]) assert.ok(publicPosts(rows, null, { businessOwnerId: none }).every((post) => post.from_business === false), "a thread with no owner marks nothing");
  assert.ok(publicPosts(rows, null).every((post) => post.from_business === false), "and so does an ordinary thread");
});

test("the business page tells the helper who the owner is, through the owner helper, and the label is drawn on the question", () => {
  const read = (file) => fs.readFileSync(file, "utf8");
  assert.match(read("app/discussions/[slug]/page.js"), /publicPosts\(thread, userId, \{ businessOwnerId: ownerAccountOf\(merchant\) \}\)/);
  assert.doesNotMatch(read("app/discussions/[slug]/page.js"), /owner_user_id/, "the page file never names the owner's account field");
  assert.match(read("app/discussions/[slug]/BusinessQuestions.js"), /q\.from_business \? \(\s*<span className="owner-reply-badge"[^>]*>\s*From the business\s*<\/span>/);
});

// ---------- through the real routes ----------

const fake = new FakePostgrest();
fake.withDiscussionThreads = true;
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
const as = (userId) => { globalThis.__KC_TEST__ = { userId, roles: userId ? { [userId]: "user" } : {}, revalidatedPaths: [], cookies: {} }; };
beforeEach(() => { fake.reset(); fake.withDiscussionThreads = true; as(null); });
const json = (url, method, body) => new Request(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const seed = (o) => fake.tables.reviews.push(row(o));

test("the post you make comes back without an account id and marked as yours, and is stored under your account", async () => {
  as("user_alice_SECRET");
  const response = await postRoute(json("/api/reviews", "POST", { title: "Best momo in Patan", category: "Food", verdict: "Ramro chha", summary: "The jhol momo at the corner is worth it." }));
  assert.equal(response.status, 200);
  const { review } = await response.json();
  assert.equal("user_id" in review, false);
  assert.equal(review.mine, true);
  assert.doesNotMatch(JSON.stringify(review), /_SECRET/);
  assert.equal(fake.tables.reviews[0].user_id, "user_alice_SECRET", "the account is still stored: only the browser stops receiving it");
});

test("the edit you make comes back the same way; only the author may edit, and the server still says so", async () => {
  const ID = "00000000-0000-4000-8000-000000000001";
  seed({ id: ID, topic_slug: "t", user_id: "user_alice_SECRET", at: "2026-11-01T00:00:00Z" });
  as("user_bob_SECRET");
  const refused = await patchRoute(json(`/api/reviews/${ID}`, "PATCH", { summary: "I am not the author.", verdict: "Ramro chha" }), { params: { id: ID } });
  assert.equal(refused.status, 403, "ownership is still checked on the server, by account");
  as("user_alice_SECRET");
  const ok = await patchRoute(json(`/api/reviews/${ID}`, "PATCH", { summary: "Edited by the author.", verdict: "Ramro chha" }), { params: { id: ID } });
  assert.equal(ok.status, 200);
  const { review } = await ok.json();
  assert.equal("user_id" in review, false);
  assert.equal(review.mine, true);
  assert.equal(review.summary, "Edited by the author.");
});

test("\"load more\" sends no account id, says which posts are the viewer's, and a failed sign-in check means signed out", async () => {
  seed({ id: "p1", topic_slug: "t", user_id: "user_alice_SECRET", at: "2026-11-01T00:00:00Z" });
  seed({ id: "p2", topic_slug: "t", user_id: "user_bob_SECRET", at: "2026-11-02T00:00:00Z" });
  as("user_bob_SECRET");
  const signedIn = await (await loadMore(new Request("http://localhost/api/discussions/page?offset=0"))).json();
  assert.doesNotMatch(JSON.stringify(signedIn), /_SECRET/);
  const byId = Object.fromEntries(signedIn.rows.map((post) => [post.id, post]));
  assert.deepEqual([byId.p1.mine, byId.p2.mine], [false, true]);
  assert.deepEqual([byId.p1.by_op, byId.p2.by_op], [true, false]);
  as(null);
  const out = await (await loadMore(new Request("http://localhost/api/discussions/page?offset=0"))).json();
  assert.doesNotMatch(JSON.stringify(out), /_SECRET/);
  assert.ok(out.rows.every((post) => post.mine === false));
});

test("the home page's posts carry no account id", async () => {
  seed({ id: "p1", topic_slug: "t", user_id: "user_alice_SECRET", at: "2026-11-01T00:00:00Z" });
  seed({ id: "p2", topic_slug: "t", user_id: "user_bob_SECRET", at: "2026-11-02T00:00:00Z" });
  const data = await getHomeData("user_bob_SECRET");
  assert.ok(data.reviews.length >= 2);
  assert.doesNotMatch(JSON.stringify(data), /user_alice_SECRET|user_carol_SECRET/);
  assert.ok(data.reviews.every((post) => !("user_id" in post)));
  assert.deepEqual(data.reviews.filter((post) => post.mine).map((post) => post.id), ["p2"]);
});

// ---------- guards on the code ----------

function files(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(full));
    else if (/\.js$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("no code that runs in the browser reads an account id, and each place that sends posts out uses the helper", () => {
  const offenders = files("app").filter((file) => !file.startsWith("app/api/") && !file.startsWith("app/admin/") && /^["']use client["']/.test(fs.readFileSync(file, "utf8")) && /\buser_id\b/.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(offenders, [], "a client file reads user_id: have the server send an answer instead (lib/publicPosts.js)");
  const read = (file) => fs.readFileSync(file, "utf8");
  const page = read("app/discussions/[slug]/page.js");
  assert.match(page, /const posts = publicPosts\(thread, userId, \{ businessOwnerId: ownerAccountOf\(merchant\) \}\);/);
  assert.equal((page.match(/reviews=\{posts\}/g) || []).length, 2, "both the business and the ordinary thread get the cleaned posts");
  assert.doesNotMatch(page, /reviews=\{thread\}/);
  assert.match(read("app/discussions/page.js"), /reviews=\{publicPosts\(threadPage\.rows, userId\)\}/);
  assert.match(read("app/api/discussions/page/route.js"), /rows: publicPosts\(rows, userId\)/);
  assert.match(read("lib/supabase/queries.js"), /reviews: publicPosts\(reviews, userId\)/);
  assert.match(read("app/api/reviews/route.js"), /review: publicPost\(review, userId\)/);
  assert.match(read("app/api/reviews/[id]/route.js"), /review: publicPost\(data, userId\)/);
  assert.match(read("app/components/TopicThread.js"), /const isMine = \(exp\) => exp\.mine === true;/);
  assert.match(read("app/components/TopicThread.js"), /typeof exp\.by_op === "boolean"/);
  assert.match(read("app/discussions/[slug]/BusinessQuestions.js"), /const mine = q\.mine === true;/);
  assert.match(read("app/discussions/[slug]/ThreadClient.js"), /by_op: newPostByOpener\(prev\)/);
});
