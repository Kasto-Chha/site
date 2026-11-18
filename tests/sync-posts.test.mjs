// Patch 14i: the posts plan, typed in by hand.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const P = await import("../lib/sync/posts.js");
const { POST: postRoute, PATCH: patchRoute, DELETE: deleteRoute } = await import("../app/api/admin/sync/merchants/[id]/posts/route.js");
const read = (file) => fs.readFileSync(file, "utf8");

// ---------- the rules ----------

test("a post needs a title, and the title, words, kind, day and link are checked", () => {
  assert.ok(P.cleanPost({}).error);
  assert.ok(P.cleanPost({ title: "  " }).error);
  assert.ok(P.cleanPost({ title: "x".repeat(121) }).error);
  assert.ok(P.cleanPost({ title: "a", body: "x".repeat(1501) }).error);
  assert.ok(P.cleanPost({ title: "a", kind: "ad" }).error);
  assert.ok(P.cleanPost({ title: "a", status: "done" }).error);
  assert.ok(P.cleanPost({ title: "a", planned_on: "2026-02-30" }).error);
  assert.ok(P.cleanPost(null).error && P.cleanPost([1]).error);
  assert.deepEqual(P.cleanPost({ title: " Dashain greeting ", body: "Happy Dashain", kind: "event", planned_on: "2026-10-01", button_link: "" }).values, { title: "Dashain greeting", body: "Happy Dashain", kind: "event", planned_on: "2026-10-01", button_link: null });
  assert.equal(P.cleanPost({ title: "a", planned_on: "" }).values.planned_on, null);
});

test("the button link must be https", () => {
  for (const bad of ["http://x.com", "javascript:alert(1)", "kastochha.com", "ftp://x.com/a", "https://" + "a".repeat(300) + ".com"]) assert.ok(P.cleanLink(bad).error, bad);
  assert.equal(P.cleanLink("https://kastochhanepal.com/x").link, "https://kastochhanepal.com/x");
  assert.equal(P.cleanLink("  ").link, null);
});

test("an edit changes only what it names, and an empty edit is refused", () => {
  assert.deepEqual(P.cleanPost({ status: "drafted" }, { partial: true }).values, { status: "drafted" });
  assert.ok(P.cleanPost({}, { partial: true }).error);
  assert.ok(P.cleanPost({ title: "" }, { partial: true }).error);
});

test("a post going to the owner, approved or posted must have words", () => {
  for (const status of ["waiting", "approved", "published"]) { assert.ok(P.checkFinal({ status, body: "" })); assert.ok(P.checkFinal({ status, body: "  " })); assert.equal(P.checkFinal({ status, body: "Hi" }), null); }
  for (const status of ["idea", "drafted"]) assert.equal(P.checkFinal({ status, body: "" }), null);
});

test("the plan order is by planned day with undated last, and published at the end, newest first", () => {
  const posts = [
    { id: "a", status: "idea", planned_on: null, created_at: "1" },
    { id: "b", status: "drafted", planned_on: "2026-12-02", created_at: "2" },
    { id: "c", status: "published", published_on: "2026-11-01", planned_on: "2026-10-30", created_at: "3" },
    { id: "d", status: "approved", planned_on: "2026-12-01", created_at: "4" },
    { id: "e", status: "published", published_on: "2026-11-10", planned_on: null, created_at: "5" }
  ];
  assert.deepEqual(P.sortPosts(posts).map((p) => p.id), ["d", "b", "a", "e", "c"]);
});

test("festival prompts carry names only, never a date", () => {
  assert.ok(P.FESTIVALS.includes("Dashain") && P.FESTIVALS.includes("Tihar"));
  assert.ok(P.FESTIVALS.every((n) => !/\d{4}/.test(n)));
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
const create = (b = { title: "Dashain greeting", body: "Happy Dashain from all of us", kind: "event", planned_on: "2026-10-01" }, id) => send(postRoute, "POST", b, id);
const patch = (b, id) => send(patchRoute, "PATCH", b, id);
const del = (post, id) => send(deleteRoute, "DELETE", undefined, id, `?post=${post}`);
const rows = () => fake.tables.sync_posts;

test("an admin plans a post; it starts as an idea and records who made it", async () => {
  const r = await create();
  assert.equal(r.status, 200);
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].status, "idea");
  assert.equal(rows()[0].created_by, "user_admin");
  assert.equal(rows()[0].merchant_id, ID);
  assert.equal(r.body.id, rows()[0].id);
});

test("a post moves along, posting records the day, and moving back clears it", async () => {
  const { body } = await create();
  for (const status of ["drafted", "waiting", "approved"]) assert.equal((await patch({ postId: body.id, status })).status, 200);
  assert.equal(rows()[0].status, "approved");
  assert.equal(rows()[0].published_on ?? null, null);
  assert.equal((await patch({ postId: body.id, status: "published" })).status, 200);
  assert.match(rows()[0].published_on, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await patch({ postId: body.id, status: "idea" })).status, 200);
  assert.equal(rows()[0].published_on, null);
});

test("a post with no words cannot go to the owner, be approved or posted", async () => {
  const { body } = await create({ title: "Idea only" });
  for (const status of ["waiting", "approved", "published"]) assert.equal((await patch({ postId: body.id, status })).status, 400, status);
  assert.equal(rows()[0].status, "idea");
  assert.equal((await patch({ postId: body.id, body: "Now it has words", status: "waiting" })).status, 200);
  assert.equal((await create({ title: "x", status: "published" })).status, 400);
});

test("an edit keeps the other fields", async () => {
  const { body } = await create();
  await patch({ postId: body.id, title: "New title" });
  assert.equal(rows()[0].title, "New title");
  assert.equal(rows()[0].body, "Happy Dashain from all of us");
  assert.equal(rows()[0].planned_on, "2026-10-01");
});

test("a post of another business is never touched", async () => {
  seed(OTHER);
  const { body } = await create(undefined, OTHER);
  assert.equal((await patch({ postId: body.id, status: "drafted" })).status, 404);
  assert.equal((await del(body.id)).status, 404);
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].status, "idea");
});

test("the audit log keeps ids and status, never the words, title or link", async () => {
  const { body } = await create({ title: "Secret promo title", body: "Private offer words", button_link: "https://example.com/private" });
  await patch({ postId: body.id, status: "drafted", body: "Edited hidden words", title: "Edited hidden title" });
  await del(body.id);
  const log = JSON.stringify(fake.tables.admin_audit_log);
  for (const action of ["sync.posts.create", "sync.posts.update", "sync.posts.delete"]) assert.ok(log.includes(action), action);
  for (const secret of ["Secret promo", "Private offer", "example.com", "Edited hidden"]) assert.ok(!log.includes(secret), secret);
});

test("a bad request changes nothing and writes no log entry", async () => {
  for (const bad of [{ title: "" }, { title: "a", kind: "ad" }, { title: "a", button_link: "http://x.com" }, { title: "a", planned_on: "nope" }]) assert.equal((await create(bad)).status, 400, JSON.stringify(bad));
  assert.equal((await patch({ postId: "nope", status: "drafted" })).status, 400);
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
  assert.equal((await patch({ postId: body.id, status: "drafted" })).status, 500);
  assert.equal((await del(body.id)).status, 500);
  fake.failWritesTo = null;
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].status, "idea");
});

test("signed out and ordinary users are refused", async () => {
  const { body } = await create();
  for (const [who, role, status] of [[null, null, 401], ["user_c", "user", 403]]) {
    as(who, role);
    assert.equal((await create()).status, status);
    assert.equal((await patch({ postId: body.id, status: "drafted" })).status, status);
    assert.equal((await del(body.id)).status, status);
  }
  assert.equal(rows().length, 1);
});

test("an operator works only on an assigned business; an unassigned one looks like it does not exist", async () => {
  const { body } = await create();
  as("user_op", "operator");
  assert.equal((await create()).status, 404);
  assert.equal((await patch({ postId: body.id, status: "drafted" })).status, 404);
  assert.equal((await del(body.id)).status, 404);
  fake.tables.sync_operator_assignments.push({ operator_user_id: "user_op", merchant_id: ID });
  assert.equal((await create()).status, 200);
  assert.equal((await patch({ postId: body.id, status: "drafted" })).status, 200);
  assert.equal((await del(body.id)).status, 200);
});

test("a Free business cannot get new posts or changes, but its posts can be removed; an unreadable stage never blocks", async () => {
  const { body } = await create();
  fake.tables.sync_merchants[0].stage = "free"; fake.tables.sync_merchants[0].trial_started_on = "2026-01-01"; fake.tables.sync_merchants[0].trial_ends_on = "2026-04-01";
  const r = await create();
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Free plan/);
  assert.equal((await patch({ postId: body.id, status: "drafted" })).status, 409);
  assert.equal(rows().length, 1);
  assert.equal((await del(body.id)).status, 200);
  assert.equal(rows().length, 0);
  fake.reset(); as("user_admin", "admin"); seed();
  assert.equal((await create()).status, 200, "no stage row: not blocked");
});

// ---------- the screen and the files ----------

test("the Google tab summarises posts and opens the full view; the panel asks twice before removing and uses no dialogs", () => {
  const page = read("app/admin/sync/[id]/page.js");
  assert.match(page, /view=posts/);
  assert.match(page, /Has migration 0032 been run\?/);
  const client = read("app/admin/sync/[id]/PostsPanel.js");
  assert.match(client, /Really remove/);
  assert.match(client, /Copy for Google/);
  assert.match(client, /Mark as posted/);
  assert.match(client, /Send for the owner/);
  assert.ok(!/window\.(confirm|alert|prompt)/.test(client));
  assert.ok(!/dangerouslySetInnerHTML/.test(client));
  assert.ok(!/<nav[\s>]/.test(client));
});

test("the migration adds one private table tied to its business and is safe to replay", () => {
  const sql = read("supabase/migrations/0032_sync_posts.sql").replace(/--.*$/gm, "");
  assert.match(sql, /create table if not exists public\.sync_posts/i);
  assert.match(sql, /references public\.sync_merchants\(id\) on delete cascade/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.sync_posts from anon, authenticated/i);
  assert.ok(!/drop\s|delete\s+from|truncate/i.test(sql));
  const book = read("docs/sync/runbook.md");
  assert.match(book, /0032_sync_posts\.sql/);
  assert.match(book, /### Posts/);
});
