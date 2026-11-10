// The thread list behind the home page's cards and the Discussions list. A business with a question and short posts
// was missing from both (found in testing, the re-test of patch 11a): the old rule says a thread with a question waits
// in "Community is Asking" until it has two experiences and about 80 words, and patch 10 keeps a business's questions
// off that strip, so the business ended up nowhere.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { getThreadPage, getRecentQuestions } = await import("../lib/supabase/queries.js");

const fake = new FakePostgrest();
fake.withDiscussionThreads = true;
const KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const saved = {};
before(async () => {
  await fake.listen();
  for (const key of KEYS) saved[key] = process.env[key];
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});
after(async () => {
  for (const key of KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  await fake.close();
});

let clock = 0;
const at = () => new Date(Date.UTC(2026, 10, 1) + ++clock * 60_000).toISOString();
const LONG = "a calm place with friendly staff and good coffee where people sit and talk for a long time in the afternoon while the rain falls outside and the street goes quiet and the day slows down and everyone stays a little longer than planned";
function post(slug, kind, summary) {
  fake.tables.reviews.push({ id: `r${fake.tables.reviews.length + 1}`, topic: slug, topic_slug: slug, title: slug, category: "Food", kind, summary, verdict: kind === "question" ? null : "Ramro chha", upvotes: 0, downvotes: 0, user_id: "u1", author_name: "Someone", created_at: at(), updated_at: null });
}
function business(slug, status = "active", kind = "cafe") {
  fake.tables.sync_merchants.push({ id: `m-${fake.tables.sync_merchants.length + 1}`, slug, topic_slug: `${slug}-test`, thread_title: `${slug}, Test`, business_name: slug, area: "Test", business_kind: kind, kind_label: null, category: "Food", status, owner_user_id: null, about: "", created_at: "2026-10-01T00:00:00Z", google_review_url: null, google_maps_url: null });
}
function reset() { fake.tables.reviews.length = 0; fake.tables.sync_merchants.length = 0; clock = 0; }
const listed = async () => [...new Set((await getThreadPage({ offset: 0, limit: 50 })).rows.map((row) => row.topic_slug))].sort();

test("the exact case from the re-test: a business with three short experiences and two questions is listed, and is not on the questions strip", async () => {
  reset();
  business("zz-test-cafe");
  post("zz-test-cafe-test", "experience", "Test one"); post("zz-test-cafe-test", "experience", "Line one\nLine two\nLine three"); post("zz-test-cafe-test", "experience", "Test three");
  post("zz-test-cafe-test", "question", "Is it quiet?"); post("zz-test-cafe-test", "question", "Do you have parking?");
  assert.deepEqual(await listed(), ["zz-test-cafe-test"]);
  assert.deepEqual(await getRecentQuestions(6), [], "its questions stay off the strip, as decided");
});

test("a business with a single short experience and a question is listed, whatever its type", async () => {
  reset();
  business("valley-view-hotel", "active", "hotel"); business("everest-tailors", "active", "other_business"); business("ram-restaurant", "active", "restaurant");
  for (const slug of ["valley-view-hotel", "everest-tailors", "ram-restaurant"]) { post(`${slug}-test`, "experience", "Nice"); post(`${slug}-test`, "question", "Open late?"); }
  assert.deepEqual(await listed(), ["everest-tailors-test", "ram-restaurant-test", "valley-view-hotel-test"]);
});

test("a business with nothing but questions is still not listed: there is nothing to read yet", async () => {
  reset();
  business("only-questions");
  post("only-questions-test", "question", "Anyone there?"); post("only-questions-test", "question", "Hello?");
  assert.deepEqual(await listed(), []);
});

test("ordinary threads are exactly as before: a question with one short answer waits, with enough answers it is listed, experiences are listed", async () => {
  reset();
  post("which-phone", "question", "Which phone is best?"); post("which-phone", "experience", "The Pixel");
  post("best-laptop", "question", "Best laptop?"); post("best-laptop", "experience", LONG); post("best-laptop", "experience", LONG);
  post("momo-in-thamel", "experience", "Good momo");
  assert.deepEqual(await listed(), ["best-laptop", "momo-in-thamel"]);
});

test("a business whose tag was removed is an ordinary thread again, with the ordinary rule", async () => {
  reset();
  business("old-diner", "cancelled", "restaurant");
  post("old-diner-test", "experience", "Fine"); post("old-diner-test", "question", "Open Sunday?");
  assert.deepEqual(await listed(), [], "one short experience and a question wait, as on any thread");
  post("old-diner-test", "experience", LONG); post("old-diner-test", "experience", LONG);
  assert.deepEqual(await listed(), ["old-diner-test"]);
});

test("if the businesses cannot be read the list still works, treating every thread as ordinary", async () => {
  reset();
  business("ram-cafe");
  post("ram-cafe-test", "experience", "Nice"); post("ram-cafe-test", "question", "Open?");
  post("momo-in-thamel", "experience", "Good momo");
  fake.failReadsFrom = "sync_merchants";
  try { assert.deepEqual(await listed(), ["momo-in-thamel"]); } finally { fake.failReadsFrom = null; }
});
