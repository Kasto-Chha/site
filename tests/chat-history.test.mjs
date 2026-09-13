// GET /api/chat/history — the sidebar's paging and search, against the real
// route handler and the real query layer.
//
// Two things are being pinned here:
//   * every conversation a user has is reachable by paging, not just the
//     first slice the page happened to render;
//   * search finds a conversation by what was said in it, not only by its
//     title (a title is the opening question cut to 80 characters, so a term
//     raised in a follow-up used to be unfindable).
//
// Both are scoped to the caller. The service-role client bypasses RLS, so the
// user_id filter in the query IS the access control, and it is asserted
// directly rather than assumed.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { db } from "./support/harness.js";
import { HISTORY_PAGE_SIZE } from "../lib/chatTopics.js";

const USER = "user_2abcTESTclerkid";
const OTHER = "user_someone_else";

let GET;

before(async () => {
  await db.listen();
  process.env.NEXT_PUBLIC_SUPABASE_URL = db.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  globalThis.__KC_TEST__ = { userId: null, roles: {}, cookies: {} };
  ({ GET } = await import("../app/api/chat/history/route.js"));
});

after(() => db.close());

beforeEach(() => {
  db.reset();
  globalThis.__KC_TEST__.userId = USER;
});

// Conversations, newest activity last in the argument order so index 0 is the
// oldest — easier to reason about than the reverse.
function seedTopics(userId, count, { prefix = "chat" } = {}) {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const row = {
      id: `${prefix}-${userId}-${i}`,
      user_id: userId,
      title: `${prefix} ${i}`,
      message_count: 2,
      archived_at: null,
      created_at: new Date(base + i * 60_000).toISOString(),
      last_message_at: new Date(base + i * 60_000).toISOString()
    };
    db.tables.chat_topics.push(row);
    rows.push(row);
  }
  return rows;
}

function seedMessage(topicId, userId, role, content) {
  db.tables.chat_messages.push({
    id: `msg-${db.tables.chat_messages.length}`,
    topic_id: topicId,
    user_id: userId,
    role,
    content,
    created_at: new Date().toISOString()
  });
}

async function get(query) {
  const response = await GET(new Request(`https://kastochha.com/api/chat/history${query}`));
  return { status: response.status, body: await response.json() };
}

// --------------------------------------------------------------------------
// Paging
// --------------------------------------------------------------------------

test("the first page is capped and carries a cursor", async () => {
  seedTopics(USER, HISTORY_PAGE_SIZE + 10);

  const { status, body } = await get("");
  assert.equal(status, 200);
  assert.equal(body.topics.length, HISTORY_PAGE_SIZE);
  assert.ok(body.nextCursor, "a full page means there may be more");
  assert.equal(body.nextCursor, body.topics.at(-1).last_message_at);
});

test("a short page reports no cursor, so the client stops asking", async () => {
  seedTopics(USER, 3);

  const { body } = await get("");
  assert.equal(body.topics.length, 3);
  assert.equal(body.nextCursor, null);
});

test("an empty history is a clean, terminal answer", async () => {
  const { status, body } = await get("");
  assert.equal(status, 200);
  assert.deepEqual(body.topics, []);
  assert.equal(body.nextCursor, null);
});

test("paging reaches every conversation, once each, newest first", async () => {
  const total = HISTORY_PAGE_SIZE * 2 + 7;
  seedTopics(USER, total);

  const seen = [];
  let cursor = null;
  let pages = 0;

  do {
    const { body } = await get(cursor ? `?cursor=${encodeURIComponent(cursor)}` : "");
    seen.push(...body.topics.map((topic) => topic.id));
    cursor = body.nextCursor;
    pages += 1;
    assert.ok(pages < 20, "paging should terminate");
  } while (cursor);

  assert.equal(seen.length, total, "every conversation was returned");
  assert.equal(new Set(seen).size, total, "and none of them twice");

  // Newest activity first, all the way down — the order the sidebar groups by.
  const times = seen.map((id) => db.tables.chat_topics.find((t) => t.id === id).last_message_at);
  assert.deepEqual(times, [...times].sort().reverse(), "strictly descending across pages");
});

test("a conversation bumped mid-scroll is not duplicated or skipped", async () => {
  const rows = seedTopics(USER, HISTORY_PAGE_SIZE + 5);

  const first = await get("");
  const firstIds = first.body.topics.map((t) => t.id);

  // Someone answers in an old conversation while the user is scrolling. With
  // offset paging this shifts the window and the row at the boundary is either
  // returned twice or missed entirely; a keyset cursor is immune.
  const oldest = rows[0];
  oldest.last_message_at = new Date().toISOString();

  const second = await get(`?cursor=${encodeURIComponent(first.body.nextCursor)}`);
  const secondIds = second.body.topics.map((t) => t.id);

  const overlap = secondIds.filter((id) => firstIds.includes(id));
  assert.deepEqual(overlap, [], "no conversation appears on both pages");
});

test("paging never crosses into another user's history", async () => {
  seedTopics(USER, 5, { prefix: "mine" });
  seedTopics(OTHER, 60, { prefix: "theirs" });

  const { body } = await get("");
  assert.equal(body.topics.length, 5);
  assert.ok(
    body.topics.every((topic) => topic.id.startsWith("mine-")),
    "the user_id filter is the access control here"
  );
});

test("archived conversations stay out of the list", async () => {
  const rows = seedTopics(USER, 4);
  rows[0].archived_at = new Date().toISOString();

  const { body } = await get("");
  assert.equal(body.topics.length, 3);
  assert.ok(!body.topics.some((topic) => topic.id === rows[0].id));
});

test("limit is honoured but capped", async () => {
  seedTopics(USER, 150);

  assert.equal((await get("?limit=5")).body.topics.length, 5);
  assert.equal(
    (await get("?limit=9999")).body.topics.length,
    100,
    "a caller cannot ask for the whole history in one response"
  );
  assert.equal((await get("?limit=0")).body.topics.length, 1, "clamped up to at least one");
  assert.equal(
    (await get("?limit=abc")).body.topics.length,
    HISTORY_PAGE_SIZE,
    "junk falls back to the default"
  );
});

test("a cursor that is not a timestamp is rejected, not silently ignored", async () => {
  seedTopics(USER, 50);

  // Silently dropping it would serve page one forever — an infinite scroll
  // that never advances and never says why.
  const { status, body } = await get("?cursor=not-a-date");
  assert.equal(status, 400);
  assert.match(body.error, /cursor/i);
});

test("history requires a signed-in caller", async () => {
  seedTopics(USER, 3);
  globalThis.__KC_TEST__.userId = null;

  const { status, body } = await get("");
  assert.equal(status, 401);
  assert.ok(!body.topics);
});

// --------------------------------------------------------------------------
// Search
// --------------------------------------------------------------------------

test("search matches conversation titles", async () => {
  seedTopics(USER, 3);
  db.tables.chat_topics[1].title = "Laptop warranty kasto chha?";

  const { body } = await get("?q=warranty");
  assert.equal(body.topics.length, 1);
  assert.equal(body.topics[0].title, "Laptop warranty kasto chha?");
});

test("search matches what was said inside a conversation", async () => {
  const rows = seedTopics(USER, 3);
  // The title is the opening question; the term only ever appears in a later
  // turn. This is the case title-only search could never find.
  seedMessage(rows[2].id, USER, "user", "ani tyo ko warranty kati barsa ho?");

  const { body } = await get("?q=warranty");
  assert.equal(body.topics.length, 1);
  assert.equal(body.topics[0].id, rows[2].id);
});

test("search matches the assistant's answers too", async () => {
  const rows = seedTopics(USER, 2);
  seedMessage(rows[0].id, USER, "assistant", "Tyo phone ko battery 5000mAh chha.");

  const { body } = await get("?q=5000mAh");
  assert.equal(body.topics.length, 1);
  assert.equal(body.topics[0].id, rows[0].id);
});

test("a conversation matching on both title and content appears once", async () => {
  const rows = seedTopics(USER, 2);
  rows[0].title = "Warranty question";
  seedMessage(rows[0].id, USER, "user", "warranty warranty warranty");

  const { body } = await get("?q=warranty");
  assert.equal(body.topics.length, 1, "the two queries are unioned, not concatenated");
});

test("many matching turns in one conversation still yield one result", async () => {
  const rows = seedTopics(USER, 3);
  for (let i = 0; i < 50; i += 1) seedMessage(rows[1].id, USER, "user", `warranty turn ${i}`);
  seedMessage(rows[2].id, USER, "user", "warranty mentioned once here");

  const { body } = await get("?q=warranty");
  assert.equal(body.topics.length, 2, "a chatty thread cannot crowd out the others");
  assert.deepEqual(new Set(body.topics.map((t) => t.id)), new Set([rows[1].id, rows[2].id]));
});

test("search never reaches another user's conversations or messages", async () => {
  const mine = seedTopics(USER, 1, { prefix: "mine" });
  const theirs = seedTopics(OTHER, 1, { prefix: "theirs" });
  theirs[0].title = "warranty secrets";
  seedMessage(theirs[0].id, OTHER, "user", "warranty details");
  seedMessage(mine[0].id, USER, "user", "warranty details");

  const { body } = await get("?q=warranty");
  assert.equal(body.topics.length, 1);
  assert.equal(body.topics[0].id, mine[0].id);
});

test("a message row pointing at someone else's topic cannot widen the result", async () => {
  const theirs = seedTopics(OTHER, 1, { prefix: "theirs" });
  // A message carrying our user_id but another user's topic_id — the shape a
  // bug or a tampered row would take. The topic fetch is scoped to the owner,
  // so it must still return nothing.
  seedMessage(theirs[0].id, USER, "user", "warranty crossover");

  const { body } = await get("?q=warranty");
  assert.deepEqual(body.topics, []);
});

test("search is case-insensitive", async () => {
  const rows = seedTopics(USER, 1);
  rows[0].title = "Laptop WARRANTY";

  assert.equal((await get("?q=warranty")).body.topics.length, 1);
  assert.equal((await get("?q=WaRrAnTy")).body.topics.length, 1);
});

test("wildcards in the term cannot match everything", async () => {
  seedTopics(USER, 5);
  seedMessage(db.tables.chat_topics[0].id, USER, "user", "anything at all");

  // "*" belongs here too: PostgREST rewrites it to "%" before Postgres sees
  // it, so it is a wildcard even though SQL LIKE has no such character.
  for (const term of ["%", "_", "%%", "%_%", "*", "**", "%*_", "\\"]) {
    const { body } = await get(`?q=${encodeURIComponent(term)}`);
    assert.deepEqual(body.topics, [], `"${term}" must not turn into match-everything`);
  }
});

test("a wildcard next to real text searches for the text", async () => {
  const rows = seedTopics(USER, 3);
  rows[1].title = "Laptop warranty";

  for (const term of ["warranty%", "%warranty", "warr*anty".replace("*", "")]) {
    const { body } = await get(`?q=${encodeURIComponent(term)}`);
    assert.equal(body.topics.length, 1, `"${term}" should still find the conversation`);
    assert.equal(body.topics[0].id, rows[1].id);
  }
});

test("search results also carry archived and ownership filters", async () => {
  const rows = seedTopics(USER, 2);
  rows[0].title = "warranty one";
  rows[1].title = "warranty two";
  rows[1].archived_at = new Date().toISOString();
  seedMessage(rows[1].id, USER, "user", "warranty in an archived chat");

  const { body } = await get("?q=warranty");
  assert.equal(body.topics.length, 1);
  assert.equal(body.topics[0].id, rows[0].id);
});

test("a search with no matches is empty, not an error", async () => {
  seedTopics(USER, 4);

  const { status, body } = await get("?q=nothingmatchesthis");
  assert.equal(status, 200);
  assert.deepEqual(body.topics, []);
});

test("search takes precedence over paging, and returns no cursor", async () => {
  seedTopics(USER, 60);
  db.tables.chat_topics[0].title = "warranty";

  const { body } = await get("?q=warranty&cursor=2026-01-01T00:00:00.000Z");
  assert.equal(body.topics.length, 1);
  assert.equal(body.nextCursor, undefined, "a search is not a page of the list");
});
