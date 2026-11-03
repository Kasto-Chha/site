// KastoChha Sync, patch 2: tagging a business thread. The rules (validate.js), the
// thread search (threads.js), and the three admin routes, run against the real route
// code with a fake database and a fake sign-in.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { validateCreate, validateUpdate, googleLink, placeId, cleanParagraph, cleanLine, suggestHubSlug, ABOUT_MAX } = await import("../lib/sync/validate.js");
const { searchThreads, cleanSearch, threadExists } = await import("../lib/sync/threads.js");
const { GET: searchRoute } = await import("../app/api/admin/sync/threads/route.js");
const { POST: createRoute } = await import("../app/api/admin/sync/merchants/route.js");
const { PUT: updateRoute } = await import("../app/api/admin/sync/merchants/[id]/route.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");

const GOOD = { businessName: "Himal Brew House", area: "Jhamsikhel", threadMode: "new" };

// ---------- the rules ----------

test("a new business gets its addresses from its name and area, and sensible defaults", () => {
  const { values, threadMode, error } = validateCreate(GOOD);
  assert.equal(error, undefined);
  assert.equal(threadMode, "new");
  assert.equal(values.topic_slug, "himal-brew-house-jhamsikhel");
  assert.equal(values.slug, "himal-brew-house");
  assert.equal(values.category, "Food");
  assert.equal(values.business_kind, "cafe");
  assert.equal(values.status, "active");
  assert.equal(values.about, null);
  assert.equal(values.google_place_id, null);
  assert.equal(values.google_review_url, null);
  assert.equal(values.google_maps_url, null);
});

test("linking an existing thread keeps that thread's own address, and the hub address can be chosen", () => {
  const { values } = validateCreate({ ...GOOD, threadMode: "existing", threadSlug: "  Himal-Brew  ", hubSlug: "HBH-Jhamsikhel" });
  assert.equal(values.topic_slug, "himal-brew");
  assert.equal(values.slug, "hbh-jhamsikhel");
});

test("missing or unusable names, areas and addresses are refused with a clear message", () => {
  assert.match(validateCreate({ ...GOOD, businessName: "  " }).error, /name/i);
  assert.match(validateCreate({ ...GOOD, area: "" }).error, /area/i);
  assert.match(validateCreate({ ...GOOD, businessName: "x".repeat(121) }).error, /120/);
  assert.match(validateCreate({ ...GOOD, area: "x".repeat(81) }).error, /80/);
  assert.match(validateCreate({ businessName: "A", area: "B" }).error, /existing thread or start a new one/);
  assert.match(validateCreate({ ...GOOD, threadMode: "existing" }).error, /Pick the thread/);
  assert.match(validateCreate({ ...GOOD, threadMode: "existing", threadSlug: "a b" }).error, /Pick the thread/);
  assert.match(validateCreate({ ...GOOD, businessName: "!!!", area: "???" }).error, /usable thread address/);
  for (const hub of ["a b", "-x", "x-", "a--b", "a/b", "x".repeat(81)]) {
    assert.match(validateCreate({ ...GOOD, hubSlug: hub }).error, /hub address/, hub);
  }
  assert.match(validateCreate({ ...GOOD, category: "Politics" }).error, /categories/);
  assert.match(validateCreate({ ...GOOD, businessKind: "casino" }).error, /business type/);
  assert.match(validateCreate({ ...GOOD, about: "x".repeat(ABOUT_MAX + 1) }).error, /300/);
  assert.equal(validateCreate({ ...GOOD, about: "x".repeat(ABOUT_MAX) }).error, undefined);
  assert.match(validateCreate({ ...GOOD, googlePlaceId: "short" }).error, /place ID/);
  assert.match(validateCreate().error, /name/i);
});

test("only Google's own links are accepted, and they are normalised", () => {
  for (const good of [
    "https://search.google.com/local/writereview?placeid=ChIJabcdefghij",
    "https://g.page/r/CabcDEF123/review",
    "https://maps.app.goo.gl/abc123",
    "https://maps.google.com/?cid=123456",
    "https://www.google.com/maps/place/Himal+Brew+House",
    "https://google.com/maps?q=x",
    "  https://g.page/r/x/review  "
  ]) {
    assert.ok(googleLink(good), good);
  }
  for (const bad of [
    "http://g.page/r/x", "https://g.page.evil.com/r/x", "https://evil.com/?https://g.page/r/x",
    "https://search.google.com.evil.com/local/x", "https://search.google.com/search?q=x", "https://www.google.com/url?q=https://evil.com",
    "https://user:pass@g.page/r/x", "https://g.page:8443/r/x", "javascript:alert(1)", "//g.page/r/x", "g.page/r/x", "https://g.page/r/" + "x".repeat(500),
    "https://xn--g-page-0a.com/r/x", "ftp://g.page/r/x"
  ]) {
    assert.equal(googleLink(bad), null, bad);
  }
  assert.equal(googleLink(""), "");
  assert.equal(googleLink(undefined), "");
  assert.equal(googleLink("https://G.PAGE/r/x").startsWith("https://g.page/"), true);
});

test("place ids are plain tokens, or empty", () => {
  assert.equal(placeId("ChIJ4f81abcdefghIJK_-"), "ChIJ4f81abcdefghIJK_-");
  assert.equal(placeId(""), "");
  assert.equal(placeId(undefined), "");
  for (const bad of ["short", "has space 1234567", "a/b/c/d/e/f/g/h", "x".repeat(201), "<script>alert1</script>"]) assert.equal(placeId(bad), null, bad);
});

test("text is cleaned: no control characters, spaces collapsed, paragraphs kept", () => {
  assert.equal(cleanLine("  Himal \t Brew\u0000House \n ", 120), "Himal Brew House");
  assert.equal(cleanParagraph("A calm caf\u00e9.\r\n\r\n\r\n\r\nSecond  paragraph.\u0007", 300), "A calm caf\u00e9.\n\nSecond paragraph.");
  assert.equal(cleanParagraph(null, 300), "");
  assert.ok(cleanParagraph("x".repeat(500), 300).length <= 301);
});

test("a hub address is suggested from the name, falling back to the name and area", () => {
  assert.equal(suggestHubSlug({ name: "Himal Brew House", area: "Jhamsikhel" }), "himal-brew-house");
  assert.equal(suggestHubSlug({ name: "!!!", area: "Sanepa" }), "sanepa");
  assert.equal(suggestHubSlug({ name: "", area: "" }), "");
  assert.equal(suggestHubSlug(), "");
});

test("an edit may change details and status, never the addresses", () => {
  const current = { slug: "himal-brew-house", topic_slug: "himal-brew-house-jhamsikhel", status: "active" };
  const ok = validateUpdate({ about: " New text. ", status: "cancelled" }, current);
  assert.equal(ok.error, undefined);
  assert.equal(ok.values.about, "New text.");
  assert.equal(ok.values.status, "cancelled");
  assert.ok(ok.values.updated_at);
  assert.ok(!("business_name" in ok.values), "untouched fields stay out of the update");
  assert.equal(validateUpdate({ hubSlug: "himal-brew-house", area: "Sanepa" }, current).error, undefined, "repeating the same address is harmless");
  for (const attempt of [{ hubSlug: "other" }, { slug: "other" }, { threadSlug: "other-thread" }, { topicSlug: "other-thread" }]) {
    assert.match(validateUpdate({ about: "x", ...attempt }, current).error, /cannot be changed/);
  }
  assert.match(validateUpdate({ status: "paused" }, current).error, /active or cancelled/);
  assert.match(validateUpdate({}, current).error, /nothing to change/);
  assert.match(validateUpdate({ businessName: "" }, current).error, /name/i);
  assert.equal(validateUpdate({ about: "" }, current).values.about, null, "an empty About clears it");
});

// ---------- the fake world ----------

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

function signedInAs(role, userId = "user_admin_1") {
  globalThis.__KC_TEST__ = { userId: role ? userId : null, roles: role ? { [userId]: role } : {}, revalidatedPaths: [], cookies: {} };
}

function post(topic, slug, kind = "experience", at = "2026-10-01T00:00:00Z", category = "Food") {
  fake.tables.reviews.push({ id: `r-${fake.tables.reviews.length + 1}`, topic, topic_slug: slug, title: topic, category, kind, summary: "x", created_at: at });
}

beforeEach(() => {
  fake.reset();
  console.error = () => {};
  signedInAs("admin");
  post("Himal Brew House, Jhamsikhel", "himal-brew-house-jhamsikhel", "experience", "2026-10-01T00:00:00Z");
  post("Himal Brew House, Jhamsikhel", "himal-brew-house-jhamsikhel", "experience", "2026-10-02T00:00:00Z");
  post("Himal Brew House, Jhamsikhel", "himal-brew-house-jhamsikhel", "question", "2026-10-03T00:00:00Z");
  post("Himal Brew", "himal-brew", "experience", "2026-09-01T00:00:00Z");
  post("Best momo in Patan", "best-momo-in-patan", "experience", "2026-10-05T00:00:00Z");
});

const json = (url, method, body) => new Request(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const supabase = () => createServerSupabase();

// ---------- the thread search ----------

test("searching finds threads by name, with exact counts, best match first", async () => {
  const threads = await searchThreads(supabase(), "himal");
  assert.deepEqual(threads.map((t) => t.slug), ["himal-brew-house-jhamsikhel", "himal-brew"]);
  const first = threads[0];
  assert.equal(first.title, "Himal Brew House, Jhamsikhel");
  assert.equal(first.category, "Food");
  assert.equal(first.posts, 2);
  assert.equal(first.questions, 1);
  assert.equal((await searchThreads(supabase(), "HIMAL BREW HOUSE"))[0].slug, "himal-brew-house-jhamsikhel");
  assert.deepEqual((await searchThreads(supabase(), "himal bre"))[0].slug, "himal-brew-house-jhamsikhel", "more posts ranks first when neither title is an exact match");
  assert.equal((await searchThreads(supabase(), "Himal Brew"))[0].slug, "himal-brew", "an exact title match ranks first");
  assert.deepEqual(await searchThreads(supabase(), "nothing like this"), []);
});

test("an empty search lists the recent threads, and search characters are made harmless", async () => {
  const recent = await searchThreads(supabase(), "");
  assert.equal(recent.length, 3);
  assert.equal(recent[0].slug, "himal-brew-house-jhamsikhel", "the busiest thread comes first");
  assert.equal(cleanSearch("  ha%l_*f\\, (x) \"q\" 'y' "), "ha l f x q y");
  assert.equal(cleanSearch("x".repeat(200)).length, 60);
  assert.deepEqual((await searchThreads(supabase(), "%")).map((t) => t.slug).length, 3, "a lone wildcard behaves like an empty search");
  assert.equal((await searchThreads(supabase(), "", { limit: 2 })).length, 2);
});

test("a thread that is already a business thread says which", async () => {
  fake.tables.sync_merchants.push({ id: "m1", slug: "himal-brew-house", topic_slug: "himal-brew-house-jhamsikhel", business_name: "Himal Brew House", area: "Jhamsikhel", status: "active" });
  const threads = await searchThreads(supabase(), "himal");
  assert.equal(threads.find((t) => t.slug === "himal-brew-house-jhamsikhel").alreadyTaggedAs, "Himal Brew House");
  assert.equal(threads.find((t) => t.slug === "himal-brew").alreadyTaggedAs, null);
});

test("a failing database is an error, never an empty list", async () => {
  fake.failReadsFrom = "reviews";
  await assert.rejects(() => searchThreads(supabase(), "himal"));
  await assert.rejects(() => threadExists(supabase(), "himal-brew"));
  fake.failReadsFrom = null;
  assert.equal(await threadExists(supabase(), "himal-brew"), true);
  assert.equal(await threadExists(supabase(), "no-such-thread"), false);
});

test("the search route is for admins only, and reports a broken database as an error", async () => {
  signedInAs(null);
  assert.equal((await searchRoute(json("/api/admin/sync/threads?q=himal", "GET"))).status, 401);
  signedInAs("user");
  assert.equal((await searchRoute(json("/api/admin/sync/threads?q=himal", "GET"))).status, 403);
  signedInAs("admin");
  const ok = await searchRoute(json("/api/admin/sync/threads?q=himal", "GET"));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).threads.length, 2);
  fake.failReadsFrom = "reviews";
  const broken = await searchRoute(json("/api/admin/sync/threads?q=himal", "GET"));
  assert.equal(broken.status, 500);
  assert.match((await broken.json()).error, /Could not search/);
});

// ---------- tagging a business ----------

test("only admins may tag a business", async () => {
  signedInAs(null);
  assert.equal((await createRoute(json("/api/admin/sync/merchants", "POST", { ...GOOD, businessName: "Brand New Cafe" }))).status, 401);
  signedInAs("user");
  assert.equal((await createRoute(json("/api/admin/sync/merchants", "POST", { ...GOOD, businessName: "Brand New Cafe" }))).status, 403);
  assert.equal(fake.tables.sync_merchants.length, 0);
  assert.equal(fake.tables.admin_audit_log.length, 0);
});

test("starting a new thread: the business is stored, the audit trail is written first and closed", async () => {
  const res = await createRoute(json("/api/admin/sync/merchants", "POST", { businessName: "Kupondol Kettle", area: "Kupondol", threadMode: "new", about: "A quiet caf\u00e9.", googleReviewUrl: "https://g.page/r/abc123/review" }));
  assert.equal(res.status, 201);
  const { merchant } = await res.json();
  assert.equal(merchant.topic_slug, "kupondol-kettle-kupondol");
  assert.equal(merchant.slug, "kupondol-kettle");
  assert.equal(merchant.created_by, "user_admin_1");
  assert.equal(merchant.status, "active");
  assert.match(merchant.id, /^[0-9a-f-]{36}$/);
  assert.equal(fake.tables.sync_merchants.length, 1);
  const [entry] = fake.tables.admin_audit_log;
  assert.equal(entry.action, "sync.merchant.create");
  assert.equal(entry.target_id, merchant.id);
  assert.equal(entry.actor_id, "user_admin_1");
  assert.equal(entry.status, "applied");
  assert.equal(entry.before, null);
  assert.deepEqual(globalThis.__KC_TEST__.revalidatedPaths, ["/discussions/kupondol-kettle-kupondol", "/discussions"]);
});

test("linking an existing thread keeps its address and every post", async () => {
  const before = fake.tables.reviews.length;
  const res = await createRoute(json("/api/admin/sync/merchants", "POST", { businessName: "Himal Brew House", area: "Jhamsikhel", threadMode: "existing", threadSlug: "himal-brew-house-jhamsikhel", hubSlug: "himal-brew-house" }));
  assert.equal(res.status, 201);
  assert.equal((await res.json()).merchant.topic_slug, "himal-brew-house-jhamsikhel");
  assert.equal(fake.tables.reviews.length, before, "tagging never touches a post");
});

test("an unusable choice of thread is refused with a reason", async () => {
  const create = async (body) => createRoute(json("/api/admin/sync/merchants", "POST", body));
  let res = await create({ businessName: "Ghost", area: "Nowhere", threadMode: "existing", threadSlug: "no-such-thread" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /no longer has any posts/);
  res = await create({ businessName: "Himal Brew House", area: "Jhamsikhel", threadMode: "new" });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /already exists/);
  assert.equal(fake.tables.sync_merchants.length, 0);
});

test("a thread, or a hub address, can belong to only one business", async () => {
  const create = async (body) => createRoute(json("/api/admin/sync/merchants", "POST", body));
  assert.equal((await create({ businessName: "Himal Brew House", area: "Jhamsikhel", threadMode: "existing", threadSlug: "himal-brew-house-jhamsikhel" })).status, 201);
  let res = await create({ businessName: "Imposter", area: "Jhamsikhel", threadMode: "existing", threadSlug: "himal-brew-house-jhamsikhel", hubSlug: "imposter" });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /already a business thread \(Himal Brew House\)/);
  res = await create({ businessName: "Other Cafe", area: "Patan", threadMode: "existing", threadSlug: "himal-brew", hubSlug: "himal-brew-house" });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /hub address is already used by Himal Brew House/);
  assert.equal(fake.tables.sync_merchants.length, 1);
  assert.equal(fake.tables.admin_audit_log.length, 1, "refused requests leave no audit entry");
});

test("two admins saving at once: the database's own rule gives a clear message", async () => {
  // The checks above pass, then another save lands before this insert does.
  const real = fake.tables.sync_merchants;
  const origin = globalThis.fetch;
  let injected = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url || input);
    if (!injected && init?.method === "POST" && url.includes("/sync_merchants")) {
      injected = true;
      real.push({ id: "rival", slug: "kupondol-kettle", topic_slug: "elsewhere", business_name: "Rival", area: "X", status: "active" });
    }
    return origin(input, init);
  };
  try {
    const res = await createRoute(json("/api/admin/sync/merchants", "POST", { businessName: "Kupondol Kettle", area: "Kupondol", threadMode: "new" }));
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /hub address is already used/);
    assert.equal(fake.tables.admin_audit_log[0].status, "failed");
    assert.equal(real.length, 1);
  } finally {
    globalThis.fetch = origin;
  }
});

test("bad input is refused before anything is stored", async () => {
  for (const body of [{}, { businessName: "X" }, { ...GOOD, businessName: "Fresh Cafe", googleReviewUrl: "https://evil.com/x" }, { ...GOOD, businessName: "Fresh Cafe", threadMode: "maybe" }]) {
    const res = await createRoute(json("/api/admin/sync/merchants", "POST", body));
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  const big = await createRoute(json("/api/admin/sync/merchants", "POST", { ...GOOD, businessName: "Fresh Cafe", about: "x".repeat(40_000) }));
  assert.equal(big.status, 413);
  assert.equal(fake.tables.sync_merchants.length, 0);
  assert.equal(fake.tables.admin_audit_log.length, 0);
});

test("if the audit log cannot be written, nothing is changed", async () => {
  fake.failWritesTo = "admin_audit_log";
  const res = await createRoute(json("/api/admin/sync/merchants", "POST", { ...GOOD, businessName: "Fresh Cafe" }));
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /audit log/);
  assert.equal(fake.tables.sync_merchants.length, 0);
});

test("if the save fails, the audit entry says so and the admin sees a message", async () => {
  fake.failWritesTo = "sync_merchants";
  const res = await createRoute(json("/api/admin/sync/merchants", "POST", { ...GOOD, businessName: "Fresh Cafe" }));
  assert.equal(res.status, 500);
  assert.ok((await res.json()).error.length > 5);
  assert.equal(fake.tables.admin_audit_log[0].status, "failed");
});

test("if the checks cannot read the database, say so instead of guessing", async () => {
  fake.failReadsFrom = "sync_merchants";
  const res = await createRoute(json("/api/admin/sync/merchants", "POST", { ...GOOD, businessName: "Fresh Cafe" }));
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /migration 0018/);
  assert.equal(fake.tables.admin_audit_log.length, 0);
});

// ---------- editing and removing ----------

async function tagged() {
  const res = await createRoute(json("/api/admin/sync/merchants", "POST", { businessName: "Himal Brew House", area: "Jhamsikhel", threadMode: "existing", threadSlug: "himal-brew-house-jhamsikhel" }));
  return (await res.json()).merchant;
}
const edit = (id, body) => updateRoute(json(`/api/admin/sync/merchants/${id}`, "PUT", body), { params: { id } });

test("details can be edited, with the before and after in the audit trail", async () => {
  const m = await tagged();
  fake.tables.admin_audit_log.length = 0;
  const res = await edit(m.id, { about: "Now with brunch.", category: "Food", businessKind: "restaurant" });
  assert.equal(res.status, 200);
  const { merchant } = await res.json();
  assert.equal(merchant.about, "Now with brunch.");
  assert.equal(merchant.business_kind, "restaurant");
  assert.equal(merchant.topic_slug, "himal-brew-house-jhamsikhel");
  const [entry] = fake.tables.admin_audit_log;
  assert.equal(entry.action, "sync.merchant.update");
  assert.equal(entry.status, "applied");
  assert.equal(entry.before.about, null);
  assert.equal(entry.after.about, "Now with brunch.");
});

test("the addresses cannot be changed once tagged", async () => {
  const m = await tagged();
  fake.tables.admin_audit_log.length = 0;
  for (const body of [{ hubSlug: "something-else" }, { threadSlug: "something-else" }, { area: "Sanepa", hubSlug: "x" }]) {
    const res = await edit(m.id, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match((await res.json()).error, /cannot be changed/);
  }
  assert.equal(fake.tables.sync_merchants[0].slug, "himal-brew-house");
  assert.equal(fake.tables.admin_audit_log.length, 0);
});

test("renaming a business leaves its thread and hub address alone", async () => {
  const m = await tagged();
  const res = await edit(m.id, { businessName: "Himal Brew & Bakehouse" });
  assert.equal((await res.json()).merchant.topic_slug, "himal-brew-house-jhamsikhel");
});

test("removing the tag keeps the thread and every post, and it can be restored", async () => {
  const m = await tagged();
  const posts = fake.tables.reviews.length;
  fake.tables.admin_audit_log.length = 0;
  let res = await edit(m.id, { status: "cancelled" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).merchant.status, "cancelled");
  assert.equal(fake.tables.reviews.length, posts, "posts stay");
  assert.equal(fake.tables.admin_audit_log[0].action, "sync.merchant.remove");
  res = await edit(m.id, { status: "active" });
  assert.equal((await res.json()).merchant.status, "active");
  assert.equal(fake.tables.admin_audit_log[1].action, "sync.merchant.restore");
  assert.ok(globalThis.__KC_TEST__.revalidatedPaths.includes("/discussions/himal-brew-house-jhamsikhel"));
});

test("editing is for admins, needs a real id, and fails cleanly", async () => {
  const m = await tagged();
  signedInAs("user");
  assert.equal((await edit(m.id, { about: "x" })).status, 403);
  signedInAs(null);
  assert.equal((await edit(m.id, { about: "x" })).status, 401);
  signedInAs("admin");
  assert.equal((await edit("not-a-uuid", { about: "x" })).status, 400);
  assert.equal((await edit("11111111-1111-4111-8111-111111111111", { about: "x" })).status, 404);
  assert.equal((await edit(m.id, {})).status, 400);
  assert.equal((await edit(m.id, { status: "paused" })).status, 400);
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await edit(m.id, { about: "audit down" })).status, 500);
  assert.equal(fake.tables.sync_merchants[0].about, null, "nothing changed while the audit log was down");
  fake.failWritesTo = "sync_merchants";
  assert.equal((await edit(m.id, { about: "save down" })).status, 500);
  fake.failWritesTo = null;
  fake.failReadsFrom = "sync_merchants";
  assert.equal((await edit(m.id, { about: "read down" })).status, 500);
});

// ---------- guards on the screens and routes ----------

const read = (file) => fs.readFileSync(file, "utf8");
const SCREENS = ["app/admin/sync/page.js", "app/admin/sync/new/page.js", "app/admin/sync/[id]/page.js"];
const ROUTES = ["app/api/admin/sync/threads/route.js", "app/api/admin/sync/merchants/route.js", "app/api/admin/sync/merchants/[id]/route.js"];

test("every Sync admin screen checks for an admin first, and stays out of search", () => {
  for (const file of SCREENS) {
    const source = read(file);
    assert.match(source, /requireRole\(ROLE\.ADMIN\)/, `${file} does not require an admin`);
    assert.match(source, /robots: NOINDEX_NOFOLLOW/, `${file} can be indexed`);
    assert.ok(source.indexOf("requireRole(") < source.indexOf("return <") || !source.includes("return <"), `${file} renders before checking the role`);
  }
});

test("every Sync admin route checks for an admin before it reads anything", () => {
  for (const file of ROUTES) {
    const source = read(file);
    for (const handler of source.match(/export async function (GET|POST|PUT)[^{]*\{[\s\S]*?\n\}/g) || []) {
      assert.match(handler, /requireRole\(ROLE\.ADMIN\)/, `${file}: a handler does not require an admin`);
      const gate = handler.indexOf("requireRole(");
      for (const later of ["readJsonBody(", "createServerSupabase("]) {
        if (handler.includes(later)) assert.ok(gate < handler.indexOf(later), `${file}: ${later} comes before the role check`);
      }
    }
  }
});

test("a change is written to the audit log before it is made", () => {
  for (const file of ["app/api/admin/sync/merchants/route.js", "app/api/admin/sync/merchants/[id]/route.js"]) {
    const source = read(file);
    const audit = source.indexOf("openAuditEntry(supabase");
    const write = Math.max(source.indexOf(".insert(row)"), source.indexOf(".update(values)"));
    assert.ok(audit > -1 && write > audit, `${file} writes before it audits`);
    assert.match(source, /closeAuditEntry\(supabase, auditId, \{ applied: false \}\)/, `${file} never records a failed save`);
  }
});

test("the editor screen keeps the owner's account on the server", () => {
  assert.ok(!/owner_user_id/.test(read("app/admin/sync/[id]/MerchantEditorClient.js")));
  const page = read("app/admin/sync/[id]/page.js");
  assert.ok(!/owner_user_id\s*:/.test(page), "the page passes the owner's account to the browser");
  assert.match(page, /hasOwner: Boolean\(merchant\.owner_user_id\)/);
});

test("the admin forms use only browser-safe helpers, and the admin home links to the section", () => {
  for (const file of ["app/admin/sync/new/NewMerchantClient.js", "app/admin/sync/[id]/MerchantEditorClient.js"]) {
    const source = read(file);
    assert.match(source, /^"use client";/);
    assert.ok(!/lib\/sync\/(hubToken|merchants|threads)|supabase|node:crypto/.test(source), `${file} imports something server-only`);
  }
  assert.match(read("app/admin/page.js"), /href="\/admin\/sync"/);
});
