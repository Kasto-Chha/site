// The pure list logic behind the chat sidebar.
//
// These decide whether a conversation paged in by the infinite scroll actually
// appears, appears once, and lands in the right date group — the parts of "the
// sidebar scrolls through all of my chats" that are not the fetch itself.

import test from "node:test";
import assert from "node:assert/strict";

import { groupByDate, mergeTopics, topicTitle, HISTORY_PAGE_SIZE } from "../lib/chatTopics.js";

const at = (iso) => ({ id: iso, last_message_at: iso });

// --------------------------------------------------------------------------
// mergeTopics
// --------------------------------------------------------------------------

test("pages merge into one list, newest activity first", () => {
  const page1 = [at("2026-03-03T00:00:00Z"), at("2026-03-02T00:00:00Z")];
  const page2 = [at("2026-03-01T00:00:00Z"), at("2026-02-28T00:00:00Z")];

  const merged = mergeTopics(page1, page2);
  assert.deepEqual(
    merged.map((t) => t.id),
    [
      "2026-03-03T00:00:00Z",
      "2026-03-02T00:00:00Z",
      "2026-03-01T00:00:00Z",
      "2026-02-28T00:00:00Z"
    ]
  );
});

test("a conversation returned on two pages is kept once", () => {
  const page1 = [at("2026-03-02T00:00:00Z")];
  const page2 = [at("2026-03-02T00:00:00Z"), at("2026-03-01T00:00:00Z")];

  const merged = mergeTopics(page1, page2);
  assert.equal(merged.length, 2);
  assert.equal(new Set(merged.map((t) => t.id)).size, 2);
});

test("a refetched row updates in place and moves to its new position", () => {
  const current = [
    { id: "a", title: "old title", last_message_at: "2026-03-01T00:00:00Z", message_count: 2 },
    { id: "b", title: "b", last_message_at: "2026-03-02T00:00:00Z" }
  ];

  const merged = mergeTopics(current, [
    { id: "a", title: "new title", last_message_at: "2026-03-03T00:00:00Z" }
  ]);

  assert.equal(merged[0].id, "a", "the bumped conversation is now newest");
  assert.equal(merged[0].title, "new title");
  assert.equal(merged[0].message_count, 2, "fields the update omitted are preserved");
});

test("rows without an id are ignored rather than corrupting the list", () => {
  const merged = mergeTopics([at("2026-03-01T00:00:00Z")], [
    null,
    undefined,
    {},
    { id: "", last_message_at: "2026-03-02T00:00:00Z" },
    at("2026-03-02T00:00:00Z")
  ]);

  assert.deepEqual(merged.map((t) => t.id), ["2026-03-02T00:00:00Z", "2026-03-01T00:00:00Z"]);
});

test("merging is stable when nothing new arrives", () => {
  const current = [at("2026-03-02T00:00:00Z"), at("2026-03-01T00:00:00Z")];
  assert.deepEqual(mergeTopics(current, []).map((t) => t.id), current.map((t) => t.id));
});

test("a conversation with no timestamp sorts last instead of breaking the sort", () => {
  const merged = mergeTopics(
    [{ id: "dated", last_message_at: "2026-03-01T00:00:00Z" }],
    [{ id: "undated" }]
  );
  assert.deepEqual(merged.map((t) => t.id), ["dated", "undated"]);
});

test("merging many pages keeps every conversation exactly once", () => {
  let list = [];
  const expected = [];
  for (let page = 0; page < 5; page += 1) {
    const rows = [];
    for (let i = 0; i < HISTORY_PAGE_SIZE; i += 1) {
      const n = page * HISTORY_PAGE_SIZE + i;
      const id = `topic-${n}`;
      rows.push({ id, last_message_at: new Date(Date.UTC(2026, 0, 1) - n * 60_000).toISOString() });
      expected.push(id);
    }
    list = mergeTopics(list, rows);
  }

  assert.equal(list.length, expected.length);
  assert.deepEqual(list.map((t) => t.id), expected, "still in descending order across all pages");
});

// --------------------------------------------------------------------------
// groupByDate
// --------------------------------------------------------------------------

const NOW = new Date("2026-03-10T15:00:00Z");
const daysAgo = (n, hour = 12) =>
  new Date(Date.UTC(2026, 2, 10 - n, hour, 0, 0)).toISOString();

test("conversations land in the expected date buckets", () => {
  const groups = groupByDate(
    [
      { id: "today", last_message_at: daysAgo(0) },
      { id: "yesterday", last_message_at: daysAgo(1) },
      { id: "week", last_message_at: daysAgo(4) },
      { id: "old", last_message_at: daysAgo(40) }
    ],
    NOW
  );

  assert.deepEqual(
    groups.map((g) => [g.label, g.items.map((i) => i.id)]),
    [
      ["Today", ["today"]],
      ["Yesterday", ["yesterday"]],
      ["Previous 7 days", ["week"]],
      ["Older", ["old"]]
    ]
  );
});

test("empty buckets are dropped, so no group renders with nothing under it", () => {
  const groups = groupByDate([{ id: "old", last_message_at: daysAgo(90) }], NOW);
  assert.deepEqual(groups.map((g) => g.label), ["Older"]);
});

test("grouping preserves the order it was given", () => {
  const groups = groupByDate(
    [
      { id: "a", last_message_at: daysAgo(0, 14) },
      { id: "b", last_message_at: daysAgo(0, 10) },
      { id: "c", last_message_at: daysAgo(0, 8) }
    ],
    NOW
  );
  assert.deepEqual(groups[0].items.map((i) => i.id), ["a", "b", "c"]);
});

test("a missing or unparseable timestamp falls into Older, not a crash", () => {
  const groups = groupByDate(
    [{ id: "none" }, { id: "junk", last_message_at: "not a date" }],
    NOW
  );
  assert.deepEqual(groups.map((g) => g.label), ["Older"]);
  assert.equal(groups[0].items.length, 2);
});

test("every conversation appears in exactly one bucket", () => {
  const items = Array.from({ length: 200 }, (_, i) => ({
    id: `t-${i}`,
    last_message_at: daysAgo(i % 60)
  }));

  const groups = groupByDate(items, NOW);
  const placed = groups.flatMap((g) => g.items.map((i) => i.id));

  assert.equal(placed.length, items.length, "none dropped");
  assert.equal(new Set(placed).size, items.length, "none duplicated");
});

// --------------------------------------------------------------------------
// topicTitle — unchanged, pinned because the sidebar and server both rely on it
// --------------------------------------------------------------------------

test("titles are collapsed and truncated to fit the rail", () => {
  assert.equal(topicTitle("  iPhone   17   ko price?  "), "iPhone 17 ko price?");
  assert.equal(topicTitle(""), "New chat");
  assert.equal(topicTitle(null), "New chat");

  const long = topicTitle("x".repeat(200));
  assert.equal(long.length, 80);
  assert.ok(long.endsWith("…"));
});
