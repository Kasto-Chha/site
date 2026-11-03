// The tag form's thread search: grouped, filtered, counted and paged in the database,
// with a pasted address as a way to jump straight to a thread.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest, deriveThreadSummary } from "./support/fake-postgrest.js";

const { searchThreads, parseThreadQuery, cleanSearch, threadExists, PAGE_SIZE, MAX_PAGE_SIZE } = await import("../lib/sync/threads.js");
const { GET: searchRoute } = await import("../app/api/admin/sync/threads/route.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");

const fake = new FakePostgrest();
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const saved = {};
let savedConsoleError;

before(async () => {
  await fake.listen();
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  savedConsoleError = console.error;
});

after(async () => {
  console.error = savedConsoleError;
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await fake.close();
});

let clock = 0;
const at = () => new Date(Date.UTC(2026, 9, 1) + ++clock * 60_000).toISOString();

// One post in a thread. The first post names and files the thread.
function post(topic, slug, { kind = "experience", category = "Food", createdAt } = {}) {
  fake.tables.reviews.push({ id: `r-${fake.tables.reviews.length + 1}`, topic, topic_slug: slug, title: topic, category, kind, summary: "x", created_at: createdAt || at() });
}

// n threads, the first created the oldest, so the last is the most recently active.
function manyThreads(n, { category = "Travel", prefix = "Trail" } = {}) {
  for (let i = 1; i <= n; i += 1) post(`${prefix} ${String(i).padStart(2, "0")}`, `${prefix.toLowerCase()}-${String(i).padStart(2, "0")}`, { category });
}

function signedInAs(role) {
  globalThis.__KC_TEST__ = { userId: role ? "user_a" : null, roles: role ? { user_a: role } : {}, revalidatedPaths: [], cookies: {} };
}

const supabase = () => createServerSupabase();
const slugs = (result) => result.threads.map((t) => t.slug);
const get = (url) => searchRoute(new Request(`http://localhost${url}`));

beforeEach(() => {
  fake.reset();
  clock = 0;
  console.error = () => {};
  signedInAs("admin");
});

// ---------- reading what was typed or pasted ----------

test("words search titles; a link, /discussions/slug or a bare address finds that thread", () => {
  assert.deepEqual(parseThreadQuery("himal brew"), { slug: "", fromAddress: false, search: "himal brew" });
  assert.deepEqual(parseThreadQuery("https://www.kastochhanepal.com/discussions/Himal-Brew-House?utm=x#top"), { slug: "himal-brew-house", fromAddress: true, search: "" });
  assert.deepEqual(parseThreadQuery("kastochhanepal.com/discussions/himal-brew-house/"), { slug: "himal-brew-house", fromAddress: true, search: "" });
  assert.deepEqual(parseThreadQuery("/discussions/momo"), { slug: "momo", fromAddress: true, search: "" });
  assert.deepEqual(parseThreadQuery("himal-brew-house"), { slug: "himal-brew-house", fromAddress: false, search: "himal brew house" });
  assert.deepEqual(parseThreadQuery("momo"), { slug: "", fromAddress: false, search: "momo" });
  assert.deepEqual(parseThreadQuery("100% real_cafe*"), { slug: "", fromAddress: false, search: "100 real cafe" });
  for (const nothing of ["", "   ", undefined, null]) assert.deepEqual(parseThreadQuery(nothing), { slug: "", fromAddress: false, search: "" });
  assert.equal(parseThreadQuery("x".repeat(500)).search.length <= 60, true);
  assert.equal(cleanSearch("  ha%l_*f\\, (x) \"q\" 'y' "), "ha l f x q y");
});

// ---------- one page at a time ----------

test("the first page is eight threads, newest activity first, with the total and a way on", async () => {
  manyThreads(20);
  const result = await searchThreads(supabase());
  assert.equal(PAGE_SIZE, 8);
  assert.equal(result.threads.length, 8);
  assert.equal(result.total, 20);
  assert.equal(result.hasMore, true);
  assert.equal(result.offset, 0);
  assert.deepEqual(slugs(result), ["trail-20", "trail-19", "trail-18", "trail-17", "trail-16", "trail-15", "trail-14", "trail-13"]);
  assert.equal(result.addressNotFound, false);
});

test("paging reaches every thread exactly once, then stops", async () => {
  manyThreads(20);
  const seen = [];
  let offset = 0;
  let pages = 0;
  for (;;) {
    const page = await searchThreads(supabase(), { offset });
    seen.push(...slugs(page));
    pages += 1;
    assert.equal(page.total, 20);
    if (!page.hasMore) break;
    offset += page.threads.length;
    assert.ok(pages < 10, "paging never ends");
  }
  assert.equal(pages, 3);
  assert.equal(seen.length, 20);
  assert.equal(new Set(seen).size, 20, "a thread appeared twice");
  assert.equal((await searchThreads(supabase(), { offset: 500 })).threads.length, 0);
  assert.equal((await searchThreads(supabase(), { offset: 500 })).hasMore, false);
});

test("ties in activity are ordered by address, so a page never reshuffles", async () => {
  const same = at();
  for (const name of ["Cherry", "Apple", "Banana"]) post(name, name.toLowerCase(), { createdAt: same });
  assert.deepEqual(slugs(await searchThreads(supabase())), ["apple", "banana", "cherry"]);
});

test("the page size and offset are kept within sensible bounds", async () => {
  manyThreads(30);
  assert.equal(MAX_PAGE_SIZE, 20);
  assert.equal((await searchThreads(supabase(), { limit: 1000 })).threads.length, 20);
  assert.equal((await searchThreads(supabase(), { limit: 0 })).threads.length, 1);
  assert.equal((await searchThreads(supabase(), { limit: -5 })).threads.length, 1);
  assert.equal((await searchThreads(supabase(), { limit: "abc" })).threads.length, 8);
  assert.equal((await searchThreads(supabase(), { limit: 3 })).threads.length, 3);
  assert.equal((await searchThreads(supabase(), { offset: -4 })).offset, 0);
  assert.equal((await searchThreads(supabase(), { offset: "oops" })).offset, 0);
});

test("a search costs one or two queries however many threads there are", async () => {
  manyThreads(300);
  const before = fake.requests.length;
  const result = await searchThreads(supabase(), { q: "trail" });
  assert.equal(result.total, 300);
  assert.equal(result.threads.length, 8);
  assert.ok(fake.requests.length - before <= 2, `${fake.requests.length - before} queries for one page`);
  const withAddress = fake.requests.length;
  await searchThreads(supabase(), { q: "trail-07" });
  assert.ok(fake.requests.length - withAddress <= 2);
});

// ---------- searching and filtering ----------

test("words match titles in any case, and the total counts the matches", async () => {
  post("Himal Brew House, Jhamsikhel", "himal-brew-house-jhamsikhel");
  post("Himal Brew", "himal-brew");
  post("Best momo in Patan", "best-momo-in-patan");
  manyThreads(10);
  const result = await searchThreads(supabase(), { q: "HIMAL" });
  assert.equal(result.total, 2);
  assert.deepEqual(slugs(result).sort(), ["himal-brew", "himal-brew-house-jhamsikhel"]);
  assert.equal((await searchThreads(supabase(), { q: "momo" })).total, 1);
  assert.equal((await searchThreads(supabase(), { q: "nothing like this" })).total, 0);
});

test("a lone wildcard or separator behaves like an empty search, never like 'match everything wrongly'", async () => {
  manyThreads(10);
  for (const junk of ["%", "_", "*", "%%", "\\", "()"]) assert.equal((await searchThreads(supabase(), { q: junk })).total, 10, junk);
  assert.equal((await searchThreads(supabase(), { q: "tr%il" })).total, 0, "a wildcard inside a word is not a wildcard");
});

test("a thread is named and filed by its first post, and counted by kind", async () => {
  post("Loksewa exam", "loksewa-exam", { category: "Career", createdAt: "2026-10-01T00:00:00Z" });
  post("Different title later", "loksewa-exam", { category: "Other", kind: "question", createdAt: "2026-10-02T00:00:00Z" });
  post("Different title later", "loksewa-exam", { category: "Other", createdAt: "2026-10-03T00:00:00Z" });
  const [thread] = (await searchThreads(supabase())).threads;
  assert.equal(thread.title, "Loksewa exam");
  assert.equal(thread.category, "Career");
  assert.equal(thread.posts, 2);
  assert.equal(thread.questions, 1);
  assert.equal(thread.latest, "2026-10-03T00:00:00Z");
  assert.equal(thread.alreadyTaggedAs, null);
});

test("the category filter narrows the list, and the total follows", async () => {
  manyThreads(12, { category: "Travel", prefix: "Trail" });
  manyThreads(5, { category: "Food", prefix: "Momo" });
  const food = await searchThreads(supabase(), { category: "Food" });
  assert.equal(food.total, 5);
  assert.ok(food.threads.every((t) => t.category === "Food"));
  assert.equal((await searchThreads(supabase(), { category: "Travel", q: "trail 0" })).total, 9);
  assert.equal((await searchThreads(supabase(), { category: "Muglan" })).total, 0);
});

test("threads that are already business threads are hidden, unless asked for", async () => {
  post("Himal Brew House, Jhamsikhel", "himal-brew-house-jhamsikhel");
  post("Kupondol Kettle", "kupondol-kettle-kupondol");
  fake.tables.sync_merchants.push({ id: "m1", slug: "himal-brew-house", topic_slug: "himal-brew-house-jhamsikhel", business_name: "Himal Brew House", area: "Jhamsikhel", status: "active" });
  const hidden = await searchThreads(supabase());
  assert.deepEqual(slugs(hidden), ["kupondol-kettle-kupondol"]);
  assert.equal(hidden.total, 1);
  const shown = await searchThreads(supabase(), { includeTagged: true });
  assert.equal(shown.total, 2);
  assert.equal(shown.threads.find((t) => t.slug === "himal-brew-house-jhamsikhel").alreadyTaggedAs, "Himal Brew House");
  fake.tables.sync_merchants[0].status = "cancelled";
  assert.equal((await searchThreads(supabase())).total, 1, "a removed tag still holds the thread");
});

// ---------- pasting an address ----------

test("a pasted link finds that one thread, even if it is already tagged or in another category", async () => {
  post("Himal Brew House, Jhamsikhel", "himal-brew-house-jhamsikhel", { category: "Food" });
  manyThreads(10);
  fake.tables.sync_merchants.push({ id: "m1", slug: "himal-brew-house", topic_slug: "himal-brew-house-jhamsikhel", business_name: "Himal Brew House", area: "Jhamsikhel", status: "active" });
  const result = await searchThreads(supabase(), { q: "https://www.kastochhanepal.com/discussions/Himal-Brew-House-Jhamsikhel?x=1", category: "Travel" });
  assert.deepEqual(slugs(result), ["himal-brew-house-jhamsikhel"]);
  assert.equal(result.total, 1);
  assert.equal(result.threads[0].alreadyTaggedAs, "Himal Brew House");
  assert.equal(result.hasMore, false);
  assert.equal(result.addressNotFound, false);
});

test("a pasted address that matches nothing says so, rather than listing everything", async () => {
  manyThreads(10);
  const result = await searchThreads(supabase(), { q: "kastochhanepal.com/discussions/no-such-thread" });
  assert.deepEqual(result.threads, []);
  assert.equal(result.total, 0);
  assert.equal(result.addressNotFound, true);
});

test("a bare address puts its thread first, then the title matches, each once", async () => {
  post("Himal Brew", "himal-brew");
  for (let i = 1; i <= 12; i += 1) post(`Himal brew corner ${i}`, `himal-brew-corner-${i}`);
  const first = await searchThreads(supabase(), { q: "himal-brew" });
  assert.equal(first.threads[0].slug, "himal-brew", "the exact address leads");
  assert.equal(first.threads.length, 8);
  assert.equal(first.total, 13);
  assert.equal(first.hasMore, true);
  const second = await searchThreads(supabase(), { q: "himal-brew", offset: 8 });
  const all = [...slugs(first), ...slugs(second)];
  assert.equal(new Set(all).size, 13, "no thread twice, none skipped");
  assert.equal(second.hasMore, false);
  assert.equal(all.filter((s) => s === "himal-brew").length, 1);
});

// ---------- failure ----------

test("a failing database is an error, never an empty list", async () => {
  manyThreads(3);
  fake.failReadsFrom = "sync_thread_summary";
  await assert.rejects(() => searchThreads(supabase()));
  await assert.rejects(() => searchThreads(supabase(), { q: "himal-brew" }));
  fake.failReadsFrom = null;
  assert.equal((await searchThreads(supabase())).total, 3);
  fake.failReadsFrom = "reviews";
  await assert.rejects(() => threadExists(supabase(), "trail-01"));
  fake.failReadsFrom = null;
  assert.equal(await threadExists(supabase(), "trail-01"), true);
  assert.equal(await threadExists(supabase(), "nope"), false);
});

// ---------- the route ----------

test("the search route is for admins only", async () => {
  signedInAs(null);
  assert.equal((await get("/api/admin/sync/threads")).status, 401);
  signedInAs("user");
  assert.equal((await get("/api/admin/sync/threads")).status, 403);
  signedInAs("admin");
  assert.equal((await get("/api/admin/sync/threads")).status, 200);
});

test("the route passes paging and filters through, and ignores what it does not know", async () => {
  manyThreads(30, { category: "Travel" });
  post("Momo Hub", "momo-hub", { category: "Food" });
  fake.tables.sync_merchants.push({ id: "m1", slug: "momo-hub", topic_slug: "momo-hub", business_name: "Momo Hub", area: "X", status: "active" });
  const page = await (await get("/api/admin/sync/threads?offset=8&limit=5")).json();
  assert.equal(page.threads.length, 5);
  assert.equal(page.offset, 8);
  assert.equal(page.total, 30);
  assert.equal((await (await get("/api/admin/sync/threads?limit=999")).json()).threads.length, 20);
  assert.equal((await (await get("/api/admin/sync/threads?category=Travel")).json()).total, 30);
  assert.equal((await (await get("/api/admin/sync/threads?category=Not+a+category")).json()).total, 30, "an unknown category is ignored, not treated as a filter");
  assert.equal((await (await get("/api/admin/sync/threads?tagged=1")).json()).total, 31);
  assert.equal((await (await get("/api/admin/sync/threads?tagged=yes")).json()).total, 30, "only 1 turns it on");
  assert.equal((await (await get("/api/admin/sync/threads?q=trail+07")).json()).total, 1);
  const bad = await (await get("/api/admin/sync/threads?offset=abc&limit=xyz")).json();
  assert.equal(bad.offset, 0);
  assert.equal(bad.threads.length, 8);
});

test("a broken database is reported as an error that points at the migration", async () => {
  fake.failReadsFrom = "sync_thread_summary";
  const res = await get("/api/admin/sync/threads?q=himal");
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /migration 0019/);
});

// ---------- the view that does the grouping ----------

const SQL = fs.readFileSync("supabase/migrations/0019_sync_thread_summary.sql", "utf8");
const STATEMENTS = SQL.replace(/--.*$/gm, "");

test("the database view is closed to the public keys and runs with the caller's rights", () => {
  assert.match(STATEMENTS, /create or replace view public\.sync_thread_summary\s+with \(security_invoker = true\) as/);
  assert.match(STATEMENTS, /revoke all on table public\.sync_thread_summary from anon, authenticated/);
  assert.ok(!/\bgrant\b/i.test(STATEMENTS), "a grant would open the view");
  assert.ok(!/\bdrop\b/i.test(STATEMENTS));
  assert.match(STATEMENTS, /left join public\.sync_merchants m on m\.topic_slug = f\.topic_slug/);
  assert.match(STATEMENTS, /r\.kind <> 'question'/);
  assert.match(STATEMENTS, /r\.kind = 'question'/);
});

test("the test database's view has exactly the columns the real one has", () => {
  const select = STATEMENTS.match(/select f\.topic_slug,([\s\S]*?)from first_post f/)[1];
  const columns = ["topic_slug", ...select.split(",").map((c) => c.trim().split(/\s+/).pop().replace(/^\w+\./, ""))].filter(Boolean).sort();
  fake.reset();
  post("A thread", "a-thread");
  assert.deepEqual(Object.keys(deriveThreadSummary(fake.tables)[0]).sort(), columns);
});

test("the view cannot be written to", async () => {
  const res = await fetch(`${fake.url}/rest/v1/sync_thread_summary`, { method: "POST", headers: { "Content-Type": "application/json", apikey: "x", Authorization: "Bearer x" }, body: JSON.stringify({ topic_slug: "x" }) });
  assert.equal(res.status, 405);
});
