// The home page's discussion cards: a business's card says "Business" and uses its current name, and is not made to
// look like a question (decided; found in testing, check J2 and the renamed business on the home page).

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { pickCards } = await import("../lib/homeCards.js");
const { getActiveBusinessMap } = await import("../lib/sync/merchants.js");

let clock = 0;
const row = (slug, kind, text = "a post") => ({ id: `${slug}-${++clock}`, topic_slug: slug, topic: slug, title: slug, kind, summary: text, category: "Food", created_at: new Date(Date.UTC(2026, 10, 1) + clock * 60000).toISOString() });
const newestFirst = (rows) => [...rows].reverse();
const BIZ = (name, kindName) => ({ name, area: "Test", title: `${name}, Test`, category: "Food", kindName });

test("ordinary threads are unchanged: one card per thread, newest post represents it, replies are the other posts", () => {
  const pool = newestFirst([row("phone-a", "experience"), row("phone-a", "experience"), row("phone-a", "experience"), row("momo-b", "experience"), row("which-phone", "question"), row("which-phone", "experience")]);
  const cards = pickCards(pool, { limit: 6 });
  assert.deepEqual(cards.map((card) => card.slug), ["which-phone", "momo-b", "phone-a"]);
  assert.deepEqual(cards.map((card) => card.replies), [1, 0, 2]);
  assert.deepEqual(cards.map((card) => card.business), [null, null, null]);
});

test("a business's card is represented by its newest experience, not by a question, and shows no reply count", () => {
  const pool = newestFirst([...Array.from({ length: 8 }, () => row("ram-cafe-test", "experience", "lovely")), row("ram-cafe-test", "question", "vegan options?"), row("ram-cafe-test", "question", "open sunday?")]);
  const [card] = pickCards(pool, { businesses: { "ram-cafe-test": BIZ("Ram's Cafe", "Cafe") } });
  assert.equal(card.review.kind, "experience", "the newest rows are questions, and neither stands for the thread");
  assert.equal(card.review.summary, "lovely");
  assert.equal(card.replies, null, "a business's card has no reply count: its experiences are separate customers");
  assert.equal(card.business.title, "Ram's Cafe, Test");
});

test("a business with nothing but questions has no card; a hotel, a tailor and a cafe all get one when they have experiences", () => {
  const pool = newestFirst([row("only-questions-test", "question"), row("only-questions-test", "question"), row("valley-view-hotel-test", "experience"), row("everest-tailors-test", "experience"), row("ram-cafe-test", "experience"), row("plain-thread", "experience")]);
  const businesses = { "only-questions-test": BIZ("Quiet Place", "Restaurant"), "valley-view-hotel-test": BIZ("Valley View Hotel", "Hotel"), "everest-tailors-test": BIZ("Everest Tailors", "Tailor"), "ram-cafe-test": BIZ("Ram's Cafe", "Cafe") };
  const cards = pickCards(pool, { businesses });
  assert.deepEqual(cards.map((card) => card.slug), ["plain-thread", "ram-cafe-test", "everest-tailors-test", "valley-view-hotel-test"]);
  assert.deepEqual(cards.map((card) => card.business?.kindName ?? null), [null, "Cafe", "Tailor", "Hotel"]);
});

test("the limit is respected, and an empty or missing pool gives no cards", () => {
  const pool = newestFirst(Array.from({ length: 9 }, (_, i) => row(`thread-${i}`, "experience")));
  assert.equal(pickCards(pool, { limit: 6 }).length, 6);
  assert.deepEqual(pickCards([], {}), []);
  assert.deepEqual(pickCards(undefined), []);
});

const fake = new FakePostgrest();
const KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of KEYS) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
const merchant = (slug, status, kind, name) => ({ id: `m-${fake.tables.sync_merchants.length + 1}`, slug, topic_slug: `${slug}-test`, thread_title: `${name}, Test`, business_name: name, area: "Test", business_kind: kind, kind_label: null, category: "Food", status, owner_user_id: "user_SECRET", about: "", created_at: "2026-10-01T00:00:00Z", google_review_url: null, google_maps_url: null });

test("the active-business lookup returns only active businesses, with their current name, and nothing about an account", async () => {
  fake.tables.sync_merchants.length = 0;
  fake.tables.sync_merchants.push(merchant("ram-cafe", "active", "cafe", "Ram's Cafe"), merchant("old-diner", "cancelled", "restaurant", "Old Diner"), merchant("valley-view", "active", "hotel", "Valley View Hotel"));
  const map = await getActiveBusinessMap();
  assert.deepEqual(Object.keys(map).sort(), ["ram-cafe-test", "valley-view-test"]);
  assert.equal(map["ram-cafe-test"].title, "Ram's Cafe, Test");
  assert.doesNotMatch(JSON.stringify(map), /user_SECRET|owner|google/);
});

test("the active-business lookup fails soft: a database problem gives an empty map, not an error", async () => {
  fake.failReadsFrom = "sync_merchants";
  try { assert.deepEqual(await getActiveBusinessMap(), {}); } finally { fake.failReadsFrom = null; }
});

test("the home page loads the businesses alongside its threads, keeps only those on the page, and hands them to the grid", () => {
  const queries = fs.readFileSync("lib/supabase/queries.js", "utf8");
  assert.match(queries, /getActiveBusinessMap\(\)\n  \]\);/, "inside the same Promise.all, so it adds no waiting");
  assert.match(queries, /if \(inPool\.has\(slug\)\) businesses\[slug\] = business/);
  assert.match(fs.readFileSync("app/HomeClient.js", "utf8"), /<DiscussionsGrid reviews=\{reviews\} limit=\{6\} businesses=\{businesses\} \/>/);
  const grid = fs.readFileSync("app/components/DiscussionsGrid.js", "utf8");
  assert.match(grid, /pickCards\(reviews, \{ businesses, limit \}\)/);
  assert.match(grid, /<span className="topic-biz-chip">Business<\/span>/);
  assert.match(grid, /replies === null \? null : <span className="disc-replies">/, "no reply count is drawn for a business's card");
  assert.match(grid, /business \? business\.title : review\.title \|\| review\.topic/);
});
