// Counting what a thread holds (found in testing as checks E14 and J10). A thread page said "7 experiences · 6 replies"
// at the top and "6 experiences" in its card, because the top line, the preview text and the search-engine data counted
// every post, questions included.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { businessMetadata, experiencesOnly, threadCountsLine } = await import("../lib/sync/threadPage.js");

const MERCHANT = { business_name: "Himal Brew House", area: "Jhamsikhel", business_kind: "cafe", kind_label: null, category: "Food", about: "A calm cafe in Jhamsikhel.", google_review_url: null, google_maps_url: null, topic_slug: "himal-brew-house-jhamsikhel", thread_title: "Himal Brew House, Jhamsikhel" };
const WORDS = "a calm place with friendly staff and good coffee where people sit and talk for a long time in the afternoon while the rain falls outside";
const post = (kind, i) => ({ id: `${kind}-${i}`, kind, topic: MERCHANT.thread_title, title: MERCHANT.thread_title, summary: `${WORDS} number ${i}`, verdict: kind === "question" ? null : "Ramro chha" });
const many = (kind, n) => Array.from({ length: n }, (_, i) => post(kind, i));

test("the counts line: a business page gives experiences, replies and questions; a question thread gives its answers", () => {
  assert.equal(threadCountsLine([...many("experience", 8), ...many("question", 2)], { business: true }), "8 experiences \u00b7 7 replies \u00b7 2 questions");
  assert.equal(threadCountsLine(many("experience", 1), { business: true }), "1 experience \u00b7 0 replies");
  assert.equal(threadCountsLine([...many("experience", 2), ...many("question", 1)], { business: true }), "2 experiences \u00b7 1 reply \u00b7 1 question");
  assert.equal(threadCountsLine(many("question", 2), { business: true }), "0 experiences \u00b7 2 questions");
  // An ordinary thread that opens with a question: one question and two answers is two experiences, with no replies.
  assert.equal(threadCountsLine([post("question", 0), ...many("experience", 2)]), "2 experiences");
  assert.equal(threadCountsLine([post("question", 0)]), "0 experiences");
  // An ordinary thread of experiences reads as it always did.
  assert.equal(threadCountsLine(many("experience", 3)), "3 experiences \u00b7 2 replies");
  assert.equal(threadCountsLine([]), "0 experiences");
  assert.equal(threadCountsLine(null), "0 experiences");
});

test("experiencesOnly keeps every post except a question, and tolerates rows with no kind", () => {
  const rows = [post("experience", 1), post("question", 2), { id: "old", summary: "a row from before posts had a kind" }];
  assert.deepEqual(experiencesOnly(rows).map((row) => row.id), ["experience-1", "old"]);
  assert.deepEqual(experiencesOnly(undefined), []);
});

test("a business page's preview counts experiences only, and the question is not one of them", () => {
  const meta = businessMetadata({ slug: MERCHANT.topic_slug, merchant: MERCHANT, thread: [...many("experience", 8), ...many("question", 2)] });
  assert.match(meta.description, /8 experiences shared on Himal Brew House, Jhamsikhel/);
  assert.doesNotMatch(meta.description, /10 experiences/);
  const first = businessMetadata({ slug: MERCHANT.topic_slug, merchant: MERCHANT, thread: [post("question", 0), ...many("experience", 3)] });
  assert.match(first.description, /3 experiences shared/, "a question that opened the page does not turn it into a question thread");
});

test("a business page needs two real experiences, not counting questions, before search engines may show it", () => {
  const oneAndOne = businessMetadata({ slug: MERCHANT.topic_slug, merchant: MERCHANT, thread: [post("experience", 1), post("question", 2)] });
  assert.equal(oneAndOne.robots.index, false, "one review and one question is two posts, but one experience");
  const twoAndTwo = businessMetadata({ slug: MERCHANT.topic_slug, merchant: MERCHANT, thread: [...many("experience", 3), ...many("question", 2)] });
  assert.equal(twoAndTwo.robots.index, true);
  const onlyQuestions = businessMetadata({ slug: MERCHANT.topic_slug, merchant: MERCHANT, thread: many("question", 3) });
  assert.equal(onlyQuestions.robots.index, false);
  assert.equal(onlyQuestions.description, "Himal Brew House, Jhamsikhel. A calm cafe in Jhamsikhel.", "a page of questions only is described by the business itself");
});

test("the thread page uses the shared counting for its headline and leaves questions out of the search-engine data on a business page", () => {
  const page = fs.readFileSync("app/discussions/[slug]/page.js", "utf8");
  assert.match(page, /threadCountsLine\(thread, \{ business: Boolean\(biz\) \}\)/);
  assert.match(page, /experiences: biz \? experiencesOnly\(thread\) : thread/);
  assert.doesNotMatch(page, /const replies = thread\.length - 1/);
});
