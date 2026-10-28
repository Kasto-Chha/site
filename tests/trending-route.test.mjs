// What POST /api/chat records about how a conversation was opened, and that
// the homepage's "Trending searches" reads it back the way it should — the
// real route handler writing, the real query layer ranking.
//
// The ranking rules themselves are in tests/trending-searches.test.mjs. This
// file is about the seam: a rule is only as good as the row it is given.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { setup, teardown, resetState, state, db, chat } from "./support/harness.js";
import { CHAT_SOURCE } from "../lib/chatTopics.js";
import { TRENDING_SEARCH_TAG } from "../lib/trendingSearches.js";

let getTrendingChatSearches;
let getTrendingSearchReport;
let DELETE;

before(async () => {
  await setup();
  ({ getTrendingChatSearches, getTrendingSearchReport } = await import(
    "../lib/supabase/queries.js"
  ));
  ({ DELETE } = await import("../app/api/chat/history/route.js"));
});
after(() => teardown());
beforeEach(() => resetState());

const USER = "user_2abcTESTclerkid";
const OTHER = "user_someone_else";

const ask = (message, options = {}) =>
  chat({
    ...options,
    body: {
      messages: [{ role: "user", content: message }],
      ...(options.source !== undefined ? { source: options.source } : {})
    }
  });

const topics = () => db.tables.chat_topics;

// --------------------------------------------------------------------------
// What the route writes
// --------------------------------------------------------------------------

test("a typed question is stored as asked, with no source", async () => {
  const res = await ask("  BYD ko   gaadi kasto chha? ", { userId: USER });
  assert.equal(res.status, 200);

  const [topic] = topics();
  assert.equal(topic.title, "BYD ko gaadi kasto chha?");
  assert.equal(topic.opening_query, "BYD ko gaadi kasto chha?");
  assert.equal(topic.source, null);
  assert.equal(topic.user_id, USER);
  assert.equal(topic.guest_key, null, "an account is already told apart by user_id");
});

test("a clicked question keeps its source; anything else is dropped", async () => {
  await ask("ABC Trek", { userId: USER, source: CHAT_SOURCE.TRENDING });
  await ask("ABC Trek", { userId: USER, source: "<script>alert(1)</script>" });
  await ask("ABC Trek", { userId: USER, source: { nested: true } });
  await ask("ABC Trek", { userId: USER, source: "" });

  assert.deepEqual(
    topics().map((topic) => topic.source),
    ["trending", null, null, null]
  );
});

test("a guest's key is the same for the same question and nothing else", async () => {
  await ask("Pathao kasto chha?", { ip: "203.0.113.10" });
  await ask("pathao   KASTO chha", { ip: "203.0.113.10" });
  await ask("Deepal S07", { ip: "203.0.113.10" });
  await ask("Pathao kasto chha?", { ip: "203.0.113.99" });

  const [first, respelled, otherQuestion, otherAddress] = topics().map((t) => t.guest_key);

  assert.match(first, /^[0-9a-f]{16}$/);
  assert.equal(respelled, first, "the same search, however it is typed");
  assert.notEqual(otherQuestion, first, "two questions from one guest are not linked");
  assert.notEqual(otherAddress, first);
});

test("the guest key cannot be joined to the usage ledger", async () => {
  await ask("Pathao kasto chha?", { ip: "203.0.113.10" });

  const [{ guest_key: key }] = topics();
  const [{ identity }] = db.tables.chat_usage;
  assert.ok(identity.startsWith("ip:"));
  assert.ok(!identity.includes(key), "a different digest, not a slice of the ledger's");
});

test("a follow-up does not open a conversation, so it is never a search", async () => {
  const first = await ask("iPhone 17 ko price", { userId: USER });
  const topicId = first.headers.get("x-chat-topic-id");

  await chat({
    userId: USER,
    body: {
      messages: [
        { role: "user", content: "iPhone 17 ko price" },
        { role: "assistant", content: "Thik chha yaar." },
        { role: "user", content: "ani Pro Max?" }
      ],
      topicId,
      source: CHAT_SOURCE.TRENDING
    }
  });

  assert.equal(topics().length, 1);
  assert.equal(topics()[0].opening_query, "iPhone 17 ko price");
  assert.equal(topics()[0].source, null, "a later message cannot rewrite how it was opened");
});

test("before migration 0016 the conversation is still saved", async () => {
  db.beforeTrendingMigration = true;

  const res = await ask("Sandar ko momo", { userId: USER, source: CHAT_SOURCE.CHIP });
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("x-chat-topic-id"), "the client still gets a thread to continue");

  const [topic] = topics();
  assert.equal(topic.title, "Sandar ko momo");
  assert.ok(!("opening_query" in topic) && !("source" in topic) && !("guest_key" in topic));
  assert.equal(db.countMessages(USER, "user"), 1);
  assert.equal(db.countMessages(USER, "assistant"), 1);
});

test("a storage failure still doesn't cost the visitor their answer", async () => {
  db.failWritesTo = "chat_topics";

  const res = await ask("Sandar ko momo", { userId: USER });
  assert.equal(res.status, 200);
  assert.match(res.text, /Thik chha/);
  assert.equal(topics().length, 0);
});

// --------------------------------------------------------------------------
// Written by the route, read by the homepage
// --------------------------------------------------------------------------

test("two people typing the same search put it on the homepage; one does not", async () => {
  await ask("NTC ko 5G kasto chha?", { userId: USER });
  assert.deepEqual(await getTrendingChatSearches(), []);

  await ask("ntc ko 5g", { ip: "203.0.113.20" });
  assert.deepEqual(await getTrendingChatSearches(), ["ntc ko 5g"]);
});

test("one guest asking again and again stays one asker", async () => {
  for (let i = 0; i < 4; i += 1) await ask("mero pasal ma aaunus", { ip: "203.0.113.30" });

  assert.equal(topics().length, 4);
  assert.deepEqual(await getTrendingChatSearches(), []);
});

test("clicking a trending link never adds to what made it trend", async () => {
  await ask("Loksewa exam", { userId: USER });
  for (let i = 0; i < 5; i += 1) {
    await ask("Loksewa exam", { ip: `203.0.113.${40 + i}`, source: CHAT_SOURCE.TRENDING });
  }

  assert.equal(topics().length, 6);
  assert.deepEqual(await getTrendingChatSearches(), [], "five clicks, still one typed asker");
});

test("renaming a conversation changes neither what is shown nor what is counted", async () => {
  await ask("Bhatbhateni ko offer", { userId: USER });
  await ask("Bhatbhateni ko offer", { userId: OTHER });
  for (const topic of topics()) topic.title = "my shopping list";

  assert.deepEqual(await getTrendingChatSearches(), ["Bhatbhateni ko offer"]);
});

test("a question with a phone number in it is stored but never shown", async () => {
  await ask("9841234567 kasko number ho", { userId: USER });
  await ask("9841234567 kasko number ho", { userId: OTHER });

  assert.equal(topics().length, 2);
  assert.deepEqual(await getTrendingChatSearches(), []);
});

// --------------------------------------------------------------------------
// Deleting a conversation
// --------------------------------------------------------------------------

async function deleteHistory(userId, body) {
  state().userId = userId;
  const response = await DELETE(
    new Request("https://kastochha.com/api/chat/history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  return response.status;
}

test("deleting your chats takes them out of the count and drops the cached row", async () => {
  await ask("eSewa vs Khalti", { userId: USER });
  await ask("eSewa vs Khalti", { userId: OTHER });
  assert.deepEqual(await getTrendingChatSearches(), ["eSewa vs Khalti"]);

  assert.equal(await deleteHistory(USER, { all: true }), 200);

  assert.deepEqual(state().revalidatedTags, [TRENDING_SEARCH_TAG]);
  assert.deepEqual(await getTrendingChatSearches(), []);
});

test("a delete that fails leaves the cached row alone", async () => {
  await ask("eSewa vs Khalti", { userId: USER });
  db.failWritesTo = "chat_topics";

  assert.equal(await deleteHistory(USER, { all: true }), 500);
  assert.equal(state().revalidatedTags, undefined);
});

// --------------------------------------------------------------------------
// Hiding a search from the admin panel
// --------------------------------------------------------------------------

const ADMIN = "user_admin";

// What the panel's Hide button sends: POST /api/admin/content/searches.
async function hideFromPanel(userId, search) {
  state().userId = userId;
  const { POST } = await import("../app/api/admin/content/[type]/route.js");
  const response = await POST(
    new Request("https://kastochha.com/api/admin/content/searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        term: search.term,
        action: "hide",
        rank: 1,
        note: `Hidden from the trending panel, where it showed as "${search.label}".`
      })
    }),
    { params: { type: "searches" } }
  );
  return response.status;
}

test("Hide in the admin panel takes a search off the homepage, every spelling of it", async () => {
  state().roles[ADMIN] = "admin";
  await ask("BYD ko gaadi kasto chha?", { userId: USER });
  await ask("byd ko gaadi", { userId: OTHER });
  await ask("Loksewa exam", { userId: USER });
  await ask("loksewa exam?", { userId: OTHER });

  const before = await getTrendingSearchReport();
  const byd = before.shown.find((search) => search.term === "byd ko gaadi");
  assert.ok(byd, "it is showing, so the panel offers to hide it");

  assert.equal(await hideFromPanel(ADMIN, byd), 200);

  assert.deepEqual(
    db.tables.trending_search_rules.map((rule) => [rule.term, rule.action]),
    [["byd ko gaadi", "hide"]]
  );
  assert.deepEqual(state().revalidatedTags, [TRENDING_SEARCH_TAG], "visitors' copy is dropped too");

  const after = await getTrendingSearchReport();
  assert.deepEqual(after.shown.map((search) => search.term), ["loksewa exam"]);
  assert.deepEqual(await getTrendingChatSearches(), ["loksewa exam?"]);

  const [entry] = db.tables.admin_audit_log;
  assert.deepEqual(
    [entry.actor_id, entry.action, entry.target_type, entry.status],
    [ADMIN, "content.create", "searches", "applied"]
  );
});

test("only an admin can hide a search", async () => {
  await ask("Loksewa exam", { userId: USER });
  await ask("Loksewa exam", { userId: OTHER });
  const [search] = (await getTrendingSearchReport()).shown;

  assert.equal(await hideFromPanel(USER, search), 403);
  assert.equal(await hideFromPanel(null, search), 401);

  assert.deepEqual(db.tables.trending_search_rules, []);
  assert.equal(state().revalidatedTags, undefined);
  assert.deepEqual(await getTrendingChatSearches(), ["Loksewa exam"]);
});
