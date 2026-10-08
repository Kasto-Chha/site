// The homepage's "Trending searches": ranked from what people asked the
// assistant, not from the trending polls.
//
// Two layers are pinned here. The rules — what counts as a search, who counts
// as an asker, what an admin can override — are pure and tested directly. The
// query is run against the fake PostgREST so the filters it builds (typed
// only, archived excluded, capped to the sample) are the ones that decide the
// answer, and so is what it does on a database that has not been migrated yet.
//
// What the chat route writes for all this to read is in
// tests/trending-route.test.mjs; the migration's SQL is in
// tests/trending-sql.test.mjs.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { db } from "./support/harness.js";
import { chatHref, chatSource, CHAT_SOURCE } from "../lib/chatTopics.js";
import {
  isPublicSearch,
  rankTrendingSearches,
  searchKey,
  TRENDING_MIN_ASKERS,
  TRENDING_SEARCH_LIMIT,
  TRENDING_SEARCH_MAX,
  TRENDING_SEARCH_SAMPLE
} from "../lib/trendingSearches.js";

const NOW = Date.parse("2026-06-01T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

// One conversation, as the query hands it to the ranking. `by` is an account;
// `guest` is a guest_key; neither is a guest from before guest_key existed.
function asked(search, { by = null, guest = null, hoursAgo = 1, source = null, title } = {}) {
  return {
    title: title ?? search,
    opening_query: search,
    user_id: by,
    guest_key: guest,
    source,
    created_at: new Date(NOW - hoursAgo * HOUR).toISOString()
  };
}

const rank = (rows, options = {}) => rankTrendingSearches(rows, { now: NOW, ...options });

// --------------------------------------------------------------------------
// What counts as the same search
// --------------------------------------------------------------------------

test("case, spacing, punctuation and the 'kasto chha' suffix don't make a new search", () => {
  const same = [
    "ABC Trek",
    "abc trek",
    "  ABC   Trek ",
    "ABC Trek?",
    "ABC Trek kasto chha?",
    "abc trek kasto cha",
    "ABC Trek kasto xa ta",
    "ABC Trek kasto 6",
    "ABC Trek kasto ho?"
  ];
  assert.deepEqual([...new Set(same.map(searchKey))], ["abc trek"]);
  assert.equal(searchKey("पठाओ कस्तो छ?"), searchKey("पठाओ"));
});

test("different searches stay different — nothing is merged on a guess", () => {
  assert.notEqual(searchKey("iPhone"), searchKey("iPhone 17 Pro price"));
  assert.notEqual(searchKey("BYD ko gaadi"), searchKey("BYD"));
  // The suffix is only stripped from the end, where it is a suffix.
  assert.equal(searchKey("kasto phone kinne"), "kasto phone kinne");
});

// --------------------------------------------------------------------------
// What may be shown at all
// --------------------------------------------------------------------------

test("ordinary searches are showable, including prices and model numbers", () => {
  for (const search of [
    "BYD ko gaadi kasto chha?",
    "iPhone 17 Pro Max 256GB price",
    "Rs 150000 ko laptop",
    "2026 ma IPO",
    "TV",
    "पठाओ कस्तो छ?",
    "z".repeat(TRENDING_SEARCH_MAX)
  ]) {
    assert.equal(isPublicSearch(search), true, search);
  }
});

test("contact details never qualify, however many people type them", () => {
  for (const search of [
    "9841234567 ko number kasko ho",
    "call 98-4123-4567",
    "+977 984 123 4567",
    "01-4411234 ma phone garda",
    "९८४१२३४५६७",
    "ram.sharma@gmail.com lai email",
    "https://example.com/offer kasto chha",
    "www.example.com herna"
  ]) {
    assert.equal(isPublicSearch(search), false, search);
  }
});

test("greetings, pokes at the box and non-searches don't qualify", () => {
  for (const search of [
    "hi",
    "Hello!",
    "namaste",
    "k cha?",
    "test",
    "thank you",
    "hello kasto chha",
    "kasto chha?",
    "New chat",
    "",
    "   ",
    "???",
    "12345",
    "a",
    `${"x".repeat(79)}…`,
    "y".repeat(TRENDING_SEARCH_MAX + 1)
  ]) {
    assert.equal(isPublicSearch(search), false, JSON.stringify(search));
  }
});

// --------------------------------------------------------------------------
// Who counts as an asker
// --------------------------------------------------------------------------

test("a search is shown once two different people have asked it, not before", () => {
  assert.equal(TRENDING_MIN_ASKERS, 2);

  const ranked = rank([
    asked("BYD ko resale value", { by: "u1" }),
    asked("BYD ko resale value", { by: "u2" }),
    asked("mero ghar ko kura", { by: "u3" })
  ]);

  assert.deepEqual(ranked, ["BYD ko resale value"]);
});

test("one account repeating a question is one asker", () => {
  const ranked = rank(
    Array.from({ length: 10 }, (_, i) => asked("mero product kinnus", { by: "spammer", hoursAgo: i }))
  );
  assert.deepEqual(ranked, []);
});

test("one guest repeating a question is one asker; two guests are two", () => {
  assert.deepEqual(
    rank([
      asked("Deepal S07", { guest: "aaaa" }),
      asked("Deepal S07", { guest: "aaaa" }),
      asked("Deepal S07", { guest: "aaaa" })
    ]),
    []
  );
  assert.deepEqual(
    rank([asked("Deepal S07", { guest: "aaaa" }), asked("Deepal S07", { guest: "bbbb" })]),
    ["Deepal S07"]
  );
});

test("guests from before guest_key count together as one asker", () => {
  const legacyGuests = Array.from({ length: 5 }, () => asked("Sandar ko momo"));
  assert.deepEqual(rank(legacyGuests), [], "five keyless guests could all be one person");
  assert.deepEqual(rank([...legacyGuests, asked("Sandar ko momo", { by: "u1" })]), [
    "Sandar ko momo"
  ]);
});

test("an account and a guest are different askers", () => {
  assert.deepEqual(
    rank([asked("NTC ko 5G", { by: "u1" }), asked("NTC ko 5G", { guest: "aaaa" })]),
    ["NTC ko 5G"]
  );
});

// --------------------------------------------------------------------------
// What counts as a search
// --------------------------------------------------------------------------

test("a clicked suggestion is not a search, so the row cannot vote for itself", () => {
  const ranked = rank([
    asked("Loksewa exam", { by: "u1" }),
    ...Object.values(CHAT_SOURCE).flatMap((source, i) => [
      asked("Loksewa exam", { by: `clicker-${i}`, source }),
      asked("Loksewa exam", { guest: `clicker-${i}`, source })
    ])
  ]);

  assert.deepEqual(ranked, [], "one typed asker, however many clicks");
});

test("the question as first asked is what counts, not what the chat was renamed to", () => {
  const ranked = rank([
    asked("Pathao kasto chha?", { by: "u1", title: "my salary notes" }),
    asked("Pathao kasto chha?", { by: "u2", title: "my salary notes" })
  ]);

  assert.deepEqual(ranked, ["Pathao kasto chha?"]);
});

test("a row from before opening_query falls back to its title", () => {
  const legacy = (title, by) => ({
    title,
    user_id: by,
    created_at: new Date(NOW - HOUR).toISOString()
  });

  assert.deepEqual(rank([legacy("eSewa vs Khalti", "u1"), legacy("eSewa vs Khalti", "u2")]), [
    "eSewa vs Khalti"
  ]);
});

// --------------------------------------------------------------------------
// Order
// --------------------------------------------------------------------------

test("recent asks outweigh old ones: three people today beat five last month", () => {
  const ranked = rank([
    ...Array.from({ length: 5 }, (_, i) =>
      asked("last month's hit", { by: `old-${i}`, hoursAgo: 30 * 24 })
    ),
    ...Array.from({ length: 3 }, (_, i) => asked("today's question", { by: `new-${i}` }))
  ]);

  assert.deepEqual(ranked, ["today's question", "last month's hit"]);
});

test("at the same age, more askers rank higher; equal scores go to the latest", () => {
  const ranked = rank([
    asked("two askers", { by: "a1", hoursAgo: 5 }),
    asked("two askers", { by: "a2", hoursAgo: 5 }),
    asked("three askers", { by: "b1", hoursAgo: 5 }),
    asked("three askers", { by: "b2", hoursAgo: 5 }),
    asked("three askers", { by: "b3", hoursAgo: 5 }),
    asked("also two askers", { by: "c1", hoursAgo: 5 }),
    asked("also two askers", { by: "c2", hoursAgo: 5 })
  ]);

  assert.deepEqual(ranked, ["three askers", "two askers", "also two askers"]);
});

test("an asker's repeat adds nothing: only their most recent ask is weighed", () => {
  const ranked = rank([
    // Same two people, one of whom asked twenty times.
    ...Array.from({ length: 20 }, () => asked("asked a lot", { by: "a1", hoursAgo: 2 })),
    asked("asked a lot", { by: "a2", hoursAgo: 2 }),
    asked("asked by three", { by: "b1", hoursAgo: 2 }),
    asked("asked by three", { by: "b2", hoursAgo: 2 }),
    asked("asked by three", { by: "b3", hoursAgo: 2 })
  ]);

  assert.deepEqual(ranked, ["asked by three", "asked a lot"]);
});

test("the order rows arrive in doesn't change the answer", () => {
  const rows = [
    asked("alpha", { by: "u1", hoursAgo: 1 }),
    asked("alpha", { by: "u2", hoursAgo: 50 }),
    asked("beta", { by: "u3", hoursAgo: 3 }),
    asked("beta", { by: "u4", hoursAgo: 4 }),
    asked("beta", { by: "u5", hoursAgo: 200 })
  ];

  assert.deepEqual(rank([...rows].reverse()), rank(rows));
});

test("a search is labelled the way most people typed it", () => {
  const ranked = rank([
    asked("abc trek", { by: "u1", hoursAgo: 1 }),
    asked("ABC Trek kasto chha?", { by: "u2", hoursAgo: 2 }),
    asked("ABC Trek kasto chha?", { by: "u3", hoursAgo: 3 })
  ]);
  assert.deepEqual(ranked, ["ABC Trek kasto chha?"]);

  // Between equally common spellings, the most recent one.
  assert.deepEqual(
    rank([asked("abc trek", { by: "u1", hoursAgo: 1 }), asked("ABC Trek", { by: "u2", hoursAgo: 2 })]),
    ["abc trek"]
  );
});

test("the list is capped, and nothing to rank is an empty list", () => {
  const rows = Array.from({ length: 12 }, (_, i) => [
    asked(`search ${i}`, { by: `a${i}` }),
    asked(`search ${i}`, { by: `b${i}` })
  ]).flat();

  assert.equal(rank(rows).length, TRENDING_SEARCH_LIMIT);
  assert.equal(rank(rows, { limit: 3 }).length, 3);
  assert.deepEqual(rank([]), []);
  assert.deepEqual(rank(undefined), []);
  assert.deepEqual(rank([null, {}, { title: null }]), []);
});

// --------------------------------------------------------------------------
// Admin rules
// --------------------------------------------------------------------------

const twoAskers = (search, tag) => [
  asked(search, { by: `${tag}-1` }),
  asked(search, { by: `${tag}-2` })
];

test("a hide rule removes every search containing the term, on whole words", () => {
  const rows = [
    ...twoAskers("Sandar ko momo kasto chha?", "a"),
    ...twoAskers("MOMO pasal", "b"),
    ...twoAskers("momos ko recipe", "c")
  ];

  assert.deepEqual(rank(rows, { rules: [{ term: " Momo! ", action: "hide" }] }), [
    "momos ko recipe"
  ]);
});

test("a hide rule can be a phrase", () => {
  const rows = [...twoAskers("Ram ko pasal kasto chha", "a"), ...twoAskers("Ram mandir", "b")];

  assert.deepEqual(rank(rows, { rules: [{ term: "ram ko pasal", action: "hide" }] }), [
    "Ram mandir"
  ]);
});

test("fallback terms fill what real searches leave empty, in rank order", () => {
  const rules = [
    { term: "Third pick", action: "fallback", rank: 3 },
    { term: "First pick", action: "fallback", rank: 1 },
    { term: "Second pick", action: "fallback", rank: 2 }
  ];

  assert.deepEqual(rank([], { rules }), ["First pick", "Second pick", "Third pick"]);
  assert.deepEqual(rank(twoAskers("a real search", "a"), { rules, limit: 3 }), [
    "a real search",
    "First pick",
    "Second pick"
  ]);
});

test("fallback terms never displace a real search or repeat one", () => {
  const real = Array.from({ length: TRENDING_SEARCH_LIMIT }, (_, i) =>
    twoAskers(`real ${i}`, `r${i}`)
  ).flat();
  const rules = [{ term: "Editor's pick", action: "fallback", rank: 1 }];
  assert.ok(!rank(real, { rules }).includes("Editor's pick"));

  assert.deepEqual(
    rank(twoAskers("BYD ko gaadi kasto chha?", "a"), {
      rules: [{ term: "byd ko gaadi", action: "fallback", rank: 1 }]
    }),
    ["BYD ko gaadi kasto chha?"]
  );
});

test("malformed rules are ignored rather than breaking the row", () => {
  const rules = [
    null,
    {},
    { term: "", action: "hide" },
    { term: "???", action: "hide" },
    { term: "something", action: "promote" },
    { term: "x".repeat(TRENDING_SEARCH_MAX + 1), action: "fallback" }
  ];

  assert.deepEqual(rank(twoAskers("ordinary search", "a"), { rules }), ["ordinary search"]);
});

// --------------------------------------------------------------------------
// Links that carry a source
// --------------------------------------------------------------------------

test("chat links carry a source only when it is one the server knows", () => {
  assert.equal(chatHref("ABC Trek?"), "/chat?q=ABC%20Trek%3F");
  assert.equal(chatHref("ABC Trek", CHAT_SOURCE.TRENDING), "/chat?q=ABC%20Trek&src=trending");
  assert.equal(chatHref("a&b=c", "nonsense"), "/chat?q=a%26b%3Dc");

  assert.equal(chatSource(" Trending "), "trending");
  assert.equal(chatSource("typed"), null);
  assert.equal(chatSource(undefined), null);
  assert.equal(chatSource({ toString: () => "chip" }), "chip");
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

// `minutesAgo` orders the conversations: a smaller one is more recent.
function seedTopic(
  search,
  { userId = null, guestKey = null, source = null, minutesAgo = 1, archived = false, title } = {}
) {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  db.tables.chat_topics.push({
    id: `topic-${db.tables.chat_topics.length}`,
    user_id: userId,
    title: title ?? search,
    opening_query: search,
    source,
    guest_key: guestKey,
    archived_at: archived ? at : null,
    created_at: at,
    last_message_at: at
  });
}

test("trending searches come from chat conversations, not the trending polls", async () => {
  db.tables.trending_topics.push({ id: "poll-1", rank: 1, title: "Poll: Pathao vs inDrive" });
  seedTopic("NTC ko 5G kasto chha", { userId: "u1", minutesAgo: 3 });
  seedTopic("ntc ko 5g kasto chha?", { userId: "u2", minutesAgo: 2 });
  seedTopic("ntc ko 5g kasto chha?", { guestKey: "aaaa", minutesAgo: 1 });
  seedTopic("only one person asked this", { userId: "u3" });

  const home = await getHomeData(null);

  assert.deepEqual(home.trendingSearches, ["ntc ko 5g kasto chha?"]);
  assert.ok(home.trending.some((topic) => topic.title === "Poll: Pathao vs inDrive"));
});

test("an archived conversation is not counted", async () => {
  seedTopic("half archived", { userId: "u1" });
  seedTopic("half archived", { userId: "u2", archived: true });

  assert.deepEqual(await getTrendingChatSearches(), []);
});

test("only the newest conversations are ranked, so old favourites age out", async () => {
  for (let i = 0; i < 5; i += 1) {
    seedTopic("last year's hit", { userId: `old-${i}`, minutesAgo: 100_000 + i });
  }
  for (let i = 0; i < TRENDING_SEARCH_SAMPLE; i += 1) {
    seedTopic(`fresh ${i % 2}`, { userId: `new-${i}`, minutesAgo: i });
  }

  const ranked = await getTrendingChatSearches();
  assert.ok(!ranked.includes("last year's hit"));
  assert.deepEqual([...ranked].sort(), ["fresh 0", "fresh 1"]);
});

test("clicked conversations don't use up the sample that typed ones are ranked from", async () => {
  seedTopic("typed by two people", { userId: "u1", minutesAgo: 9000 });
  seedTopic("typed by two people", { userId: "u2", minutesAgo: 9001 });
  for (let i = 0; i < TRENDING_SEARCH_SAMPLE + 50; i += 1) {
    seedTopic("clicked a lot", { userId: `c-${i}`, source: CHAT_SOURCE.TRENDING, minutesAgo: i });
  }

  assert.deepEqual(await getTrendingChatSearches(), ["typed by two people"]);
});

test("admin rules are read from the table and applied", async () => {
  seedTopic("hidden topic kasto chha", { userId: "u1" });
  seedTopic("hidden topic kasto chha", { userId: "u2" });
  seedTopic("shown topic", { userId: "u3" });
  seedTopic("shown topic", { userId: "u4" });
  db.tables.trending_search_rules.push(
    { id: "r1", term: "hidden topic", action: "hide", rank: 1 },
    { id: "r2", term: "Editor's pick", action: "fallback", rank: 1 }
  );

  assert.deepEqual(await getTrendingChatSearches(), ["shown topic", "Editor's pick"]);
  assert.deepEqual(await getTrendingChatSearches(1), ["shown topic"]);
});

test("if the hide list cannot be read, nothing is shown rather than everything", async () => {
  seedTopic("hidden topic", { userId: "u1" });
  seedTopic("hidden topic", { userId: "u2" });
  db.tables.trending_search_rules.push({ id: "r1", term: "hidden topic", action: "hide", rank: 1 });
  db.failReadsFrom = "trending_search_rules";

  assert.deepEqual(await getTrendingChatSearches(), []);
});

test("a failed read of the conversations is an empty row, not a crash", async () => {
  seedTopic("a search", { userId: "u1" });
  seedTopic("a search", { userId: "u2" });
  db.failReadsFrom = "chat_topics";

  assert.deepEqual(await getTrendingChatSearches(), []);
});

test("no conversations yet is an empty list, which hides the row", async () => {
  assert.deepEqual(await getTrendingChatSearches(), []);
});

test("before migration 0016 the row still works, ranked from titles", async () => {
  db.beforeTrendingMigration = true;
  const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  db.tables.chat_topics.push(
    { id: "t1", user_id: "u1", title: "Bhatbhateni ko offer", archived_at: null, created_at: at(2) },
    { id: "t2", user_id: "u2", title: "bhatbhateni ko offer?", archived_at: null, created_at: at(1) },
    { id: "t3", user_id: "u3", title: "asked once", archived_at: null, created_at: at(3) }
  );

  assert.deepEqual(await getTrendingChatSearches(), ["bhatbhateni ko offer?"]);

  // It asked for the new shape first, was told the column is missing, and
  // asked again for the old one — never the new columns a second time.
  const reads = db.requests.filter((r) => r.method === "GET" && r.table === "chat_topics");
  assert.equal(reads.length, 2);
  assert.match(reads[0].query, /opening_query/);
  assert.doesNotMatch(reads[1].query, /opening_query|guest_key|source/);
});

test("TRENDING_MIN_ASKERS lowers or raises the threshold; nonsense keeps the default", async () => {
  seedTopic("asked by one", { userId: "u1" });
  seedTopic("asked by two", { userId: "u2" });
  seedTopic("asked by two", { userId: "u3" });

  const withEnv = async (value) => {
    process.env.TRENDING_MIN_ASKERS = value;
    try {
      return [...(await getTrendingChatSearches())].sort();
    } finally {
      delete process.env.TRENDING_MIN_ASKERS;
    }
  };

  assert.deepEqual(await withEnv("1"), ["asked by one", "asked by two"]);
  assert.deepEqual(await withEnv("3"), []);
  for (const junk of ["0", "-1", "abc", ""]) {
    assert.deepEqual(await withEnv(junk), ["asked by two"], `TRENDING_MIN_ASKERS=${junk}`);
  }
});

// --------------------------------------------------------------------------
// The admin form for rules
// --------------------------------------------------------------------------

test("the admin panel accepts a hide or fallback rule and nothing else", async () => {
  const { sanitizeContent } = await import("../lib/admin/contentTypes.js");

  assert.deepEqual(sanitizeContent("searches", { term: "  Momo ", action: "hide" }), {
    values: { term: "Momo", action: "hide", rank: 1, note: null }
  });
  assert.deepEqual(
    sanitizeContent("searches", { term: "ABC Trek", action: "fallback", rank: "3", note: "Dashain" }),
    { values: { term: "ABC Trek", action: "fallback", rank: 3, note: "Dashain" } }
  );
  // Left blank, a rule hides: the cautious reading of an unfinished form.
  assert.equal(sanitizeContent("searches", { term: "x" }).values.action, "hide");

  assert.match(sanitizeContent("searches", { term: "x", action: "promote" }).error, /must be one of/);
  assert.match(sanitizeContent("searches", { action: "hide" }).error, /required/);
  assert.match(
    sanitizeContent("searches", { term: "x".repeat(TRENDING_SEARCH_MAX + 1), action: "hide" }).error,
    /too long/
  );
});
