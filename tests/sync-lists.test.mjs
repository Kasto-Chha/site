// Patch 3b: a business thread is named for the business wherever threads are listed or
// suggested, and a post sent from there still lands in the same thread.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { suggestMeta } = await import("../lib/suggestText.js");
const { withBusinesses, businessEntry } = await import("../lib/sync/suggest.js");
const { getBusinessesByTopicSlugs } = await import("../lib/sync/merchants.js");
const { GET: searchRoute } = await import("../app/api/topics/search/route.js");
const { GET: pageRoute } = await import("../app/api/discussions/page/route.js");
const { searchTokens } = await import("../lib/search.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");
const { topicSlug } = await import("../lib/slug.js");
const { applyBusinesses } = await import("../lib/sync/businessTopics.js");

// ---------- the line under a suggestion ----------

test("an ordinary suggestion reads as it always did", () => {
  assert.equal(suggestMeta({ experiences: 0 }), "asked, no answers yet");
  assert.equal(suggestMeta({ experiences: 1 }), "1 experience");
  assert.equal(suggestMeta({ experiences: 12 }), "12 experiences");
  assert.equal(suggestMeta({}), "asked, no answers yet");
  assert.equal(suggestMeta(undefined), "asked, no answers yet");
});

test("a business suggestion says what it is, never 'asked, no answers yet'", () => {
  assert.equal(suggestMeta({ business: true, kindName: "Cafe", experiences: 0 }), "Cafe \u00b7 no experiences yet");
  assert.equal(suggestMeta({ business: true, kindName: "Cafe", experiences: 1 }), "Cafe \u00b7 1 experience");
  assert.equal(suggestMeta({ business: true, kindName: "Motorcycle workshop", experiences: 5 }), "Motorcycle workshop \u00b7 5 experiences");
  assert.equal(suggestMeta({ business: true, experiences: 0 }), "Business \u00b7 no experiences yet");
});

// ---------- the fake world ----------

const fake = new FakePostgrest();
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const saved = {};
let savedConsoleError, savedConsoleWarn;

before(async () => {
  await fake.listen();
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  savedConsoleError = console.error;
  savedConsoleWarn = console.warn;
});

after(async () => {
  console.error = savedConsoleError;
  console.warn = savedConsoleWarn;
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await fake.close();
});

beforeEach(() => {
  fake.reset();
  console.error = () => {};
  console.warn = () => {};
});

let clock = 0;
const at = () => new Date(Date.UTC(2026, 9, 1) + ++clock * 60_000).toISOString();

function post(topic, slug, { kind = "experience", category = "Food", summary = "Some words about it." } = {}) {
  fake.tables.reviews.push({ id: `r-${fake.tables.reviews.length + 1}`, topic, title: topic, topic_slug: slug, category, kind, summary, created_at: at() });
}

function merchant(o) {
  fake.tables.sync_merchants.push({ id: `m-${o.slug}`, business_kind: "cafe", kind_label: null, category: "Food", status: "active", owner_user_id: "user_owner_secret", about: "", ...o });
}

const supabase = () => createServerSupabase();
const HIMAL = { slug: "himal-brew-house", topic_slug: "himal-brew-house-jhamsikhel", business_name: "Himal Brew House", area: "Jhamsikhel", thread_title: "Himal Brew House, Jhamsikhel" };
const MOMO = { slug: "momo-hub", topic_slug: "momo-hub-pulchowk", business_name: "Momo Hub", area: "Pulchowk", thread_title: "Momo Hub, Pulchowk", business_kind: "restaurant" };

// ---------- business suggestions ----------

test("a business entry carries the title a post must go under, and the name to show", () => {
  const entry = businessEntry({ ...HIMAL, business_kind: "cafe", thread_title: "Himal Brew" , topic_slug: "himal-brew", category: "Food" });
  assert.equal(entry.slug, "himal-brew");
  assert.equal(entry.title, "Himal Brew", "the title posts go under: the pinned one, not the business's name");
  assert.equal(entry.label, "Himal Brew House, Jhamsikhel");
  assert.equal(entry.business, true);
  assert.equal(entry.kindName, "Cafe");
  assert.equal(entry.experiences, 0);
  assert.equal(topicSlug(entry.title), entry.slug, "picking it files the post in the thread");
  const stale = businessEntry({ ...HIMAL, thread_title: "Some Old Name" });
  assert.equal(topicSlug(stale.title), stale.slug, "a stored title that no longer makes the address is never offered");
});

test("with no businesses, the suggestions are exactly what they were", async () => {
  const threads = [{ slug: "sikko-calculator", title: "Sikko Calculator", category: "Tech & Gadgets", experiences: 2, question: null, preview: "x" }];
  const result = await withBusinesses(supabase(), searchTokens("sikko"), threads);
  assert.deepEqual(result, threads);
  assert.deepEqual(await withBusinesses(supabase(), [], []), []);
});

test("a business thread found by its posts is named for the business and put first", async () => {
  merchant(HIMAL);
  const threads = [
    { slug: "sikko-calculator", title: "Sikko Calculator", category: "Tech & Gadgets", experiences: 9, question: null },
    { slug: "himal-brew-house-jhamsikhel", title: "Himal Brew House, Jhamsikhel", category: "Food", experiences: 3, question: null }
  ];
  const result = await withBusinesses(supabase(), searchTokens("himal brew"), threads);
  assert.equal(result[0].slug, "himal-brew-house-jhamsikhel");
  assert.equal(result[0].business, true);
  assert.equal(result[0].label, "Himal Brew House, Jhamsikhel");
  assert.equal(result[0].experiences, 3, "the thread's own count is kept");
  assert.equal(result.length, 2);
  assert.equal(result[1].slug, "sikko-calculator");
  assert.equal(result[1].business, undefined, "an ordinary thread is untouched");
});

test("a business with no posts yet is offered, which the posts alone could never do", async () => {
  merchant(MOMO);
  const result = await withBusinesses(supabase(), searchTokens("momo hub"), []);
  assert.equal(result.length, 1);
  assert.equal(result[0].slug, "momo-hub-pulchowk");
  assert.equal(result[0].title, "Momo Hub, Pulchowk");
  assert.equal(result[0].experiences, 0);
  assert.equal(suggestMeta(result[0]), "Restaurant \u00b7 no experiences yet");
});

test("businesses match on their area and on their thread's title, and not on nothing", async () => {
  merchant(HIMAL);
  merchant(MOMO);
  assert.deepEqual((await withBusinesses(supabase(), searchTokens("pulchowk"), [])).map((e) => e.slug), ["momo-hub-pulchowk"]);
  assert.deepEqual((await withBusinesses(supabase(), searchTokens("jhamsikhel"), [])).map((e) => e.slug), ["himal-brew-house-jhamsikhel"]);
  assert.deepEqual(await withBusinesses(supabase(), searchTokens("zzzzzz"), []), [], "the database's filter is generous; the match is tightened here");
});

test("a business whose tag was removed is never offered", async () => {
  merchant({ ...MOMO, status: "cancelled" });
  assert.deepEqual(await withBusinesses(supabase(), searchTokens("momo hub"), []), []);
  const threads = [{ slug: "momo-hub-pulchowk", title: "Momo Hub, Pulchowk", category: "Food", experiences: 2, question: null }];
  const result = await withBusinesses(supabase(), searchTokens("momo"), threads);
  assert.equal(result[0].business, undefined, "its thread reads as an ordinary one again");
});

test("at most three businesses are added, and the list stays a sensible size without repeats", async () => {
  for (let i = 1; i <= 6; i += 1) merchant({ slug: `cafe-${i}`, topic_slug: `cafe-${i}-x`, business_name: `Cafe ${i}`, area: "X", thread_title: `Cafe ${i}, X` });
  const threads = Array.from({ length: 5 }, (_, i) => ({ slug: `plain-${i}`, title: `Plain cafe ${i}`, category: "Food", experiences: 1, question: null }));
  const result = await withBusinesses(supabase(), searchTokens("cafe"), threads);
  assert.equal(result.filter((e) => e.business).length, 3);
  assert.ok(result.length <= 6 || result.length === threads.length);
  assert.equal(new Set(result.map((e) => e.slug)).size, result.length);
  assert.equal(result.slice(0, 3).every((e) => e.business), true, "businesses lead");
});

test("if the businesses cannot be read, the ordinary suggestions still come back", async () => {
  merchant(HIMAL);
  const threads = [{ slug: "sikko-calculator", title: "Sikko Calculator", category: "Tech & Gadgets", experiences: 2, question: null }];
  fake.failReadsFrom = "sync_merchants";
  assert.deepEqual(await withBusinesses(supabase(), searchTokens("himal"), threads), threads);
});

// ---------- the search route ----------

const search = async (q) => (await searchRoute(new Request(`http://localhost/api/topics/search?q=${encodeURIComponent(q)}`))).json();

test("the search route offers an empty business thread, and names a thread a business is tagged to", async () => {
  post("Sikko Calculator", "sikko-calculator", { category: "Tech & Gadgets", summary: "Battery lasts all day." });
  post("Himal Brew House, Jhamsikhel", "himal-brew-house-jhamsikhel", { summary: "Quiet room, good coffee, friendly staff." });
  merchant(HIMAL);
  merchant(MOMO);
  let body = await search("himal brew");
  assert.equal(body.ok, true);
  assert.equal(body.topics[0].slug, "himal-brew-house-jhamsikhel");
  assert.equal(body.topics[0].business, true);
  assert.equal(body.topics[0].label, "Himal Brew House, Jhamsikhel");
  body = await search("momo");
  assert.deepEqual(body.topics.map((t) => t.slug), ["momo-hub-pulchowk"], "no posts at all, and still offered");
  assert.equal(body.topics[0].title, "Momo Hub, Pulchowk");
});

test("the search route is unchanged for a search that involves no business", async () => {
  post("Sikko Calculator", "sikko-calculator", { category: "Tech & Gadgets", summary: "Battery lasts all day." });
  merchant(HIMAL);
  const body = await search("sikko");
  assert.deepEqual(body.topics.map((t) => t.slug), ["sikko-calculator"]);
  assert.equal(body.topics[0].business, undefined);
  assert.equal(body.topics[0].label, undefined);
  assert.deepEqual(Object.keys(body.topics[0]).sort(), ["category", "experiences", "preview", "question", "slug", "title"]);
  assert.deepEqual(await search("a"), { topics: [], ok: true }, "too little typed: nothing, as before");
});

test("the search route survives the business lookup failing", async () => {
  post("Sikko Calculator", "sikko-calculator", { category: "Tech & Gadgets", summary: "Battery lasts all day." });
  fake.failReadsFrom = "sync_merchants";
  const body = await search("sikko");
  assert.equal(body.ok, true);
  assert.deepEqual(body.topics.map((t) => t.slug), ["sikko-calculator"]);
});

test("picking a business suggestion would post under the thread's own title", async () => {
  merchant({ ...HIMAL, thread_title: "Himal Brew" , topic_slug: "himal-brew" });
  const [entry] = (await search("himal")).topics;
  assert.equal(entry.title, "Himal Brew", "what the form is filled with, and so what a post is sent under");
  assert.equal(topicSlug(entry.title), "himal-brew");
  assert.equal(entry.label, "Himal Brew House, Jhamsikhel", "while the name shown is the business's");
});

// ---------- the businesses behind a page of threads ----------

test("a page's businesses are looked up in one go, and only what is safe to show comes back", async () => {
  merchant(HIMAL);
  merchant({ ...MOMO, business_kind: "other_business", kind_label: "Momo and thukpa shop" });
  merchant({ slug: "gone", topic_slug: "gone-x", business_name: "Gone", area: "X", status: "cancelled" });
  const before = fake.requests.length;
  const found = await getBusinessesByTopicSlugs(["himal-brew-house-jhamsikhel", "momo-hub-pulchowk", "gone-x", "sikko-calculator", "himal-brew-house-jhamsikhel"]);
  assert.equal(fake.requests.length - before, 1, "one query for the whole page");
  assert.deepEqual(Object.keys(found).sort(), ["himal-brew-house-jhamsikhel", "momo-hub-pulchowk"]);
  assert.deepEqual(found["himal-brew-house-jhamsikhel"], { name: "Himal Brew House", area: "Jhamsikhel", title: "Himal Brew House, Jhamsikhel", category: "Food", kindName: "Cafe" });
  assert.equal(found["momo-hub-pulchowk"].kindName, "Momo and thukpa shop");
  assert.ok(!JSON.stringify(found).includes("user_owner_secret"));
});

test("bad addresses and empty lists never reach the database", async () => {
  merchant(HIMAL);
  const before = fake.requests.length;
  for (const bad of [[], null, undefined, [""], ["a b"], ["../x"], [null, 5]]) assert.deepEqual(await getBusinessesByTopicSlugs(bad), {});
  assert.equal(fake.requests.length, before);
  assert.deepEqual(Object.keys(await getBusinessesByTopicSlugs(["HIMAL-BREW-HOUSE-JHAMSIKHEL"])), ["himal-brew-house-jhamsikhel"], "case is forgiven, as on the thread page");
});

test("a failing database gives an empty map, never an error", async () => {
  merchant(HIMAL);
  fake.failReadsFrom = "sync_merchants";
  assert.deepEqual(await getBusinessesByTopicSlugs(["himal-brew-house-jhamsikhel"]), {});
});

// ---------- the load-more route ----------

test("loading more carries the businesses among the threads it returns", async () => {
  fake.withDiscussionThreads = true;
  post("Sikko Calculator", "sikko-calculator", { category: "Tech & Gadgets" });
  post("Himal Brew House, Jhamsikhel", "himal-brew-house-jhamsikhel");
  post("Himal Brew House, Jhamsikhel", "himal-brew-house-jhamsikhel");
  merchant(HIMAL);
  const body = await (await pageRoute(new Request("http://localhost/api/discussions/page?offset=0"))).json();
  const slugs = new Set(body.rows.map((r) => r.topic_slug));
  assert.ok(slugs.has("sikko-calculator") && slugs.has("himal-brew-house-jhamsikhel"));
  assert.deepEqual(Object.keys(body.businesses), ["himal-brew-house-jhamsikhel"]);
  assert.equal(body.businesses["himal-brew-house-jhamsikhel"].title, "Himal Brew House, Jhamsikhel");
  assert.equal(typeof body.hasMore, "boolean");
  assert.equal(body.nextOffset, 30);
});

test("with no business anywhere, loading more is as it was, plus an empty map", async () => {
  fake.withDiscussionThreads = true;
  post("Sikko Calculator", "sikko-calculator", { category: "Tech & Gadgets" });
  const body = await (await pageRoute(new Request("http://localhost/api/discussions/page?offset=0"))).json();
  assert.deepEqual(Object.keys(body).sort(), ["businesses", "hasMore", "nextOffset", "rows"]);
  assert.deepEqual(body.businesses, {});
  assert.equal(body.rows.length, 1);
});

test("loading more still gives the threads if the businesses cannot be read", async () => {
  fake.withDiscussionThreads = true;
  post("Himal Brew House, Jhamsikhel", "himal-brew-house-jhamsikhel");
  merchant(HIMAL);
  fake.failReadsFrom = "sync_merchants";
  const body = await (await pageRoute(new Request("http://localhost/api/discussions/page?offset=0"))).json();
  assert.equal(body.rows.length, 1);
  assert.deepEqual(body.businesses, {});
});

// ---------- guards on the screens ----------

const read = (file) => fs.readFileSync(file, "utf8");

test("the list names a business thread for the business, but replies go under the thread's own title", () => {
  const client = read("app/discussions/ExperienceClient.js");
  assert.match(client, /businesses: initialBusinesses = \{\}/);
  assert.match(client, /applyBusinesses\(buildTopics\(\[\.\.\.items, \.\.\.extraRows\]\), \{ \.\.\.initialBusinesses, \.\.\.extraBusinesses \}\)/);
  assert.match(client, /title: topicItem\.postTitle \|\| topicItem\.title,/);
  assert.match(client, /if \(data\.businesses\) setExtraBusinesses/);
  // the share form posts what was typed or picked, never a business's display name
  assert.match(client, /const resolvedTitle = topic\.trim\(\);/);
});

test("the list page passes the businesses, and the card and the suggestion mark them", () => {
  assert.match(read("app/discussions/page.js"), /businesses=\{businesses\}/);
  assert.match(read("app/discussions/page.js"), /getBusinessesByTopicSlugs\(threadPage\.rows\.map/);
  assert.match(read("app/components/TopicThread.js"), /\{topic\.business \? <span className="topic-biz-chip">Business<\/span> : null\}/);
  const suggest = read("app/components/TopicSuggest.js");
  assert.match(suggest, /\{topic\.label \|\| topic\.title\}/);
  assert.match(suggest, /onPick\(topic\.title, topic\);/, "a pick still hands over the pinned title");
  assert.match(suggest, /suggestMeta\(topic\)/);
});

test("the stylesheet for the mark is shared and small", () => {
  const css = read("app/components/businessChip.css");
  assert.match(css, /\.topic-biz-chip/);
  assert.match(css, /\.topic-suggest-biz/);
  assert.ok(css.length < 1200);
  assert.ok(read("app/components/TopicThread.js").includes('import "./businessChip.css";'));
  assert.ok(read("app/components/TopicSuggest.js").includes('import "./businessChip.css";'));
});

test("browser code does not import the server-only business lookups", () => {
  for (const file of ["app/components/TopicSuggest.js", "app/components/TopicThread.js", "app/discussions/ExperienceClient.js"]) {
    assert.ok(!/lib\/sync\/(merchants|suggest|threads|hubToken)/.test(read(file)), `${file} imports a server-only sync module`);
  }
  assert.ok(!/node:crypto|supabase/.test(read("lib/suggestText.js")));
});

// ---------- how the list names a business thread ----------

const BIZ = { name: "Himal Brew House", area: "Jhamsikhel", title: "Himal Brew House, Jhamsikhel", category: "Food", kindName: "Cafe" };
const topic = (slug, title, category = "Other") => ({ slug, title, category, experiences: [], count: 2, score: 1, verdicts: { pos: 1, neu: 0, neg: 0 }, lastActivity: "2026-10-01" });

test("a business thread is shown by the business's name and category, and keeps its own title for replies", () => {
  const out = applyBusinesses([topic("himal-brew", "Himal Brew", "Other")], { "himal-brew": BIZ });
  assert.equal(out[0].title, "Himal Brew House, Jhamsikhel");
  assert.equal(out[0].category, "Food", "filed where the business is, for the filter and the card");
  assert.equal(out[0].postTitle, "Himal Brew", "a reply goes under the thread's own title");
  assert.equal(out[0].business, BIZ);
  assert.equal(topicSlug(out[0].postTitle), out[0].slug, "so it lands in the same thread");
  assert.equal(out[0].slug, "himal-brew");
  assert.equal(out[0].count, 2, "everything else about the thread is untouched");
});

test("a thread with no business is returned exactly as it was", () => {
  const plain = topic("sikko-calculator", "Sikko Calculator", "Tech & Gadgets");
  const out = applyBusinesses([plain], { "himal-brew": BIZ });
  assert.equal(out[0], plain, "the very same object");
  assert.deepEqual(applyBusinesses([plain], {}), [plain]);
  assert.deepEqual(applyBusinesses([plain], undefined), [plain]);
  assert.deepEqual(applyBusinesses([], { x: BIZ }), []);
});

test("only the threads that belong to a business change, whatever the mix", () => {
  const list = [topic("a", "A"), topic("b", "B"), topic("c", "C")];
  const out = applyBusinesses(list, { b: BIZ });
  assert.equal(out[0], list[0]);
  assert.equal(out[2], list[2]);
  assert.equal(out[1].business, BIZ);
  assert.deepEqual(out.map((t) => t.slug), ["a", "b", "c"], "the order is kept");
});
