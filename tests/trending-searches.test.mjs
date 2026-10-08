// The homepage's "Trending searches": ranked from what people asked the
// assistant, not from the trending polls.
//
// Two layers are pinned here. The ranking is pure and tested directly; the
// query is run against the fake PostgREST so the filters it builds — newest
// first, archived excluded, capped to the sample — are the ones that decide
// the answer.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { db } from "./support/harness.js";
import {
  rankTrendingSearches,
  TRENDING_SEARCH_MAX,
  TRENDING_SEARCH_SAMPLE
} from "../lib/chatTopics.js";

// Rows as the query returns them: newest first.
const asked = (title, user_id = null) => ({ title, user_id });

// --------------------------------------------------------------------------
// rankTrendingSearches
// --------------------------------------------------------------------------

test("the most-asked search ranks first, ties go to the most recent", () => {
  const ranked = rankTrendingSearches([
    asked("Pathao kasto chha?", "u1"),
    asked("BYD ko resale value", "u2"),
    asked("ABC Trek", "u3"),
    asked("BYD ko resale value", "u4")
  ]);

  assert.deepEqual(ranked, ["BYD ko resale value", "Pathao kasto chha?", "ABC Trek"]);
});

test("case, spacing and trailing punctuation don't split one search into several", () => {
  const ranked = rankTrendingSearches([
    asked("ABC Trek?", "u1"),
    asked("abc   trek", "u2"),
    asked("Abc trek !", "u3"),
    asked("Loksewa exam", "u4")
  ]);

  // Labelled the way it was most recently typed.
  assert.deepEqual(ranked, ["ABC Trek?", "Loksewa exam"]);
});

test("one account repeating a question counts as one asker", () => {
  const ranked = rankTrendingSearches([
    ...Array.from({ length: 10 }, () => asked("mero product kinnus", "spammer")),
    asked("Sandar ko momo", "u1"),
    asked("Sandar ko momo", "u2")
  ]);

  assert.deepEqual(ranked, ["Sandar ko momo", "mero product kinnus"]);
});

test("guests have no id, so each guest conversation is its own asker", () => {
  const ranked = rankTrendingSearches([
    asked("IPO parne chance", "u1"),
    asked("Deepal S07"),
    asked("Deepal S07")
  ]);

  assert.deepEqual(ranked, ["Deepal S07", "IPO parne chance"]);
});

test("untitled, truncated and paragraph-length titles are not searches", () => {
  const ranked = rankTrendingSearches([
    asked("New chat", "u1"),
    asked(`${"x".repeat(79)}…`, "u2"),
    asked("y".repeat(TRENDING_SEARCH_MAX + 1), "u3"),
    asked("   ", "u4"),
    asked("???", "u5"),
    asked(null, "u6"),
    null,
    asked("z".repeat(TRENDING_SEARCH_MAX), "u7")
  ]);

  assert.deepEqual(ranked, ["z".repeat(TRENDING_SEARCH_MAX)]);
});

test("the list is capped, and nothing to rank is an empty list", () => {
  const rows = Array.from({ length: 12 }, (_, i) => asked(`search ${i}`, `u${i}`));

  assert.equal(rankTrendingSearches(rows).length, 5);
  assert.equal(rankTrendingSearches(rows, 3).length, 3);
  assert.deepEqual(rankTrendingSearches([]), []);
  assert.deepEqual(rankTrendingSearches(undefined), []);
});

// --------------------------------------------------------------------------
// getTrendingChatSearches / getHomeData
// --------------------------------------------------------------------------

let getTrendingChatSearches;
let getHomeData;

before(async () => {
  await db.listen();
  process.env.NEXT_PUBLIC_SUPABASE_URL = db.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  ({ getTrendingChatSearches, getHomeData } = await import("../lib/supabase/queries.js"));
});

after(() => db.close());

beforeEach(() => db.reset());

const BASE = Date.parse("2026-01-01T00:00:00.000Z");

// `minute` orders the conversations: a larger one is more recent.
function seedTopic(title, { userId = null, minute = 0, archived = false } = {}) {
  const at = new Date(BASE + minute * 60_000).toISOString();
  db.tables.chat_topics.push({
    id: `topic-${db.tables.chat_topics.length}`,
    user_id: userId,
    title,
    archived_at: archived ? at : null,
    created_at: at,
    last_message_at: at
  });
}

test("trending searches come from chat conversations, not the trending polls", async () => {
  db.tables.trending_topics.push({ id: "poll-1", rank: 1, title: "Poll: Pathao vs inDrive" });
  seedTopic("Bhatbhateni ko offer", { userId: "u1", minute: 1 });
  seedTopic("NTC ko 5G kasto chha", { userId: "u2", minute: 2 });
  seedTopic("ntc ko 5g kasto chha?", { userId: "u3", minute: 3 });

  const home = await getHomeData(null);

  assert.deepEqual(home.trendingSearches, ["ntc ko 5g kasto chha?", "Bhatbhateni ko offer"]);
  assert.ok(home.trending.some((topic) => topic.title === "Poll: Pathao vs inDrive"));
});

test("an archived conversation is left out", async () => {
  seedTopic("visible search", { userId: "u1", minute: 1 });
  seedTopic("archived search", { userId: "u2", minute: 2, archived: true });

  assert.deepEqual(await getTrendingChatSearches(), ["visible search"]);
});

test("only the newest conversations are ranked, so old favourites age out", async () => {
  for (let i = 0; i < 5; i += 1) seedTopic("last year's hit", { userId: `old-${i}`, minute: i });
  for (let i = 0; i < TRENDING_SEARCH_SAMPLE; i += 1) {
    seedTopic(`fresh ${i % 2}`, { userId: `new-${i}`, minute: 100 + i });
  }

  const ranked = await getTrendingChatSearches();
  assert.ok(!ranked.includes("last year's hit"));
  assert.deepEqual([...ranked].sort(), ["fresh 0", "fresh 1"]);
});

test("no conversations yet is an empty list, which hides the row", async () => {
  assert.deepEqual(await getTrendingChatSearches(), []);
});
