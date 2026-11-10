// The home page's "Community is Asking" strip: a question asked on a business's own page stays off it (a decided
// rule, found in testing as check E12 / J1). General questions are unaffected.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { getRecentQuestions } = await import("../lib/supabase/queries.js");

const fake = new FakePostgrest();
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
function question(slug, text, category = "Food") {
  fake.tables.reviews.push({ id: `q-${fake.tables.reviews.length + 1}`, topic: text, topic_slug: slug, title: text, category, kind: "question", summary: text, verdict: null, created_at: at(), user_id: "u1", author_name: "Someone" });
}
function merchant(slug, status, businessKind) {
  fake.tables.sync_merchants.push({ id: `m-${fake.tables.sync_merchants.length + 1}`, slug: slug.replace(/-test$/, ""), topic_slug: slug, thread_title: slug, business_name: slug, area: "Test", business_kind: businessKind, kind_label: null, category: "Food", status, owner_user_id: null, about: "", created_at: at(), google_review_url: null, google_maps_url: null });
}

test("a question from a business's page is not on the strip, whatever the business's status or type; a general one is", async () => {
  fake.tables.reviews.length = 0;
  fake.tables.sync_merchants.length = 0;
  question("any-parking-near-patan", "Is there any parking near Patan?");
  question("ram-cafe-test", "Do you have vegan options?");
  question("valley-view-hotel-test", "Is breakfast included?");
  question("everest-tailors-test", "How long does a suit take?");
  question("old-diner-test", "Are you open on Sundays?");
  merchant("ram-cafe-test", "active", "cafe");
  merchant("valley-view-hotel-test", "active", "hotel");
  merchant("everest-tailors-test", "active", "other_business");
  merchant("old-diner-test", "cancelled", "restaurant");
  const shown = await getRecentQuestions(6);
  assert.deepEqual(shown.map((item) => item.topic_slug), ["any-parking-near-patan"]);
});

test("with no business questions at all, the strip is as it was", async () => {
  fake.tables.reviews.length = 0;
  fake.tables.sync_merchants.length = 0;
  question("best-phone-2026", "Which phone is best?", "Tech & Gadgets");
  question("momo-places-thamel", "Where are the best momos in Thamel?");
  const shown = await getRecentQuestions(6);
  assert.deepEqual(shown.map((item) => item.topic_slug).sort(), ["best-phone-2026", "momo-places-thamel"]);
});

test("an empty site, and a strip made only of business questions, both come back empty and do not fail", async () => {
  fake.tables.reviews.length = 0;
  fake.tables.sync_merchants.length = 0;
  assert.deepEqual(await getRecentQuestions(6), []);
  question("ram-cafe-test", "Do you have vegan options?");
  merchant("ram-cafe-test", "active", "cafe");
  assert.deepEqual(await getRecentQuestions(6), []);
});
