import { isDiscussionIndexable } from "../seo/indexable";
import { unstable_noStore as noStore } from "next/cache";

import { createServerSupabase } from "./server";

async function safeQuery(runQuery, fallback = []) {
  noStore();
  try {
    const supabase = createServerSupabase();
    const { data, error } = await runQuery(supabase);
    if (error) {
      console.error("Supabase query failed:", error.message);
      return fallback;
    }
    return data ?? fallback;
  } catch (error) {
    console.error("Supabase unavailable:", error?.message || error);
    return fallback;
  }
}

export async function getTrendingTopics() {
  return safeQuery((supabase) =>
    supabase.from("trending_topics").select("*").order("rank", { ascending: true })
  );
}

export async function getFeaturedStories() {
  return safeQuery((supabase) =>
    supabase.from("featured_stories").select("*").order("slot", { ascending: true })
  );
}

// Every experience on the site, for the sitemap. Paginated.
//
// The sitemap previously called getReviews(10000) on the assumption that asking
// for a big number returns everything. It doesn't: PostgREST enforces its own
// ceiling via the "Max Rows" setting in Supabase's API config (commonly 1000),
// and it applies regardless of what .limit() asks for. Past that many rows the
// sitemap would silently stop listing discussions — no error, no warning, and
// nothing to notice until traffic didn't arrive.
//
// That is the same failure mode as the getReviews(200) bug on the thread page:
// works while the site is small, breaks quietly once it succeeds.
//
// .range() pages through in fixed windows instead, stopping when a page comes
// back empty. Works whatever Max Rows is set to.
//
// Bounds, stated honestly: MAX_PAGES x pageSize is 500,000 experiences, so this
// is not literally unlimited. But the sitemap format runs out first — the
// sitemaps.org spec caps a single file at 50,000 urls, and at that many
// discussions this file becomes invalid regardless of how the rows are
// fetched. That is the real ceiling, and the answer there is a sitemap index
// pointing at several files rather than a larger fetch here. Somewhere north of
// ~10,000 discussions is also the point at which regenerating this on every
// request stops being sensible and it should be cached or built on a schedule.
//
// None of that is close for KastoChha. Noted so it is a known boundary rather
// than a surprise.
//
// Only the columns the sitemap actually needs: the slug for the URL, created_at
// for lastmod, and the text the indexation gate measures. Selecting "*" here
// would pull vote counts and author names for every row in the database.
export async function getAllReviewsForSitemap({ pageSize = 1000 } = {}) {
  const columns = "topic, title, summary, topic_slug, created_at, updated_at";
  // Experiences only: a thread holding nothing but an unanswered question is
  // not content, and counting the question toward the indexation gate would
  // put empty threads in the sitemap.
  const rows = [];

  // A ceiling on iterations, not on rows: 500 pages is far beyond any realistic
  // size, but it means a misbehaving response can never spin this loop forever
  // during a build.
  const MAX_PAGES = 500;

  let from = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await safeQuery((supabase) =>
      supabase
        .from("reviews")
        .select(columns)
        .eq("kind", "experience")
        // Stable ordering matters: without it Postgres may return rows in a
        // different order per page and .range() would skip and duplicate.
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1)
    );

    // Empty page is the only reliable end signal.
    if (!batch.length) break;

    rows.push(...batch);

    // Advance by what actually came back, never by what was asked for. If Max
    // Rows is set lower than pageSize — say 500 when we asked for 1000 — every
    // page arrives short, and advancing by pageSize would skip the rows in
    // between. Advancing by batch.length picks up exactly where this page
    // stopped, so the cap changes how many round trips this takes and nothing
    // else.
    from += batch.length;
  }

  return rows;
}

// Single-row lookups used by the shareable permalink pages.
function getById(table, id) {
  return safeQuery(
    (supabase) => supabase.from(table).select("*").eq("id", id).single(),
    null
  );
}

export function getTrendingTopicById(id) {
  return getById("trending_topics", id);
}

export function getBattleById(id) {
  return getById("battles", id);
}

export function getReviewById(id) {
  return getById("reviews", id);
}

export function getFeaturedStoryById(id) {
  return getById("featured_stories", id);
}

// Featured articles are addressed by slug, so their URLs say what they are:
// /featured/how-lokta-paper-outlived-empires rather than a uuid. Unique index
// idx_featured_stories_slug makes this a single lookup.
// Trending topics and battles are addressed by slug too. Not for ranking —
// both are noindexed — but because these are the pages people actually share,
// and "/battle/nepal-vs-uae" survives being pasted into a story in a way a uuid
// does not.
export function getTrendingTopicBySlug(slug) {
  return safeQuery(
    (supabase) =>
      supabase.from("trending_topics").select("*").eq("slug", slug).single(),
    null
  );
}

export function getBattleBySlug(slug) {
  return safeQuery(
    (supabase) => supabase.from("battles").select("*").eq("slug", slug).single(),
    null
  );
}

export function getFeaturedStoryBySlug(slug) {
  return safeQuery(
    (supabase) =>
      supabase.from("featured_stories").select("*").eq("slug", slug).single(),
    null
  );
}

export async function getBattles() {
  return safeQuery((supabase) =>
    supabase.from("battles").select("*").order("order", { ascending: true })
  );
}

// Every row on the discussion side — experiences AND the questions that start
// threads.
//
// This briefly filtered to kind = "experience", which made a thread whose only
// row is an unanswered question invisible in the Discussions list. The page
// existed and resolved at its own URL, but nothing linked to it. A question is
// a thread; it belongs in the list with zero answers, not hidden until someone
// replies.
//
// Filtering happens where it actually matters, not here:
//
//   buildTopics()               excludes questions from the answer count and
//                               the verdict split
//   getAllReviewsForSitemap()   its own query, experiences only — an
//                               unanswered question is not content yet
//   getLiveSiteStats()          counts each kind separately
export async function getReviews(limit = 200) {
  return safeQuery((supabase) =>
    supabase
      .from("reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)
  );
}

// A page of discussion threads, COMPLETE, newest activity first.
//
// Two queries, and the split matters:
//
//   1. the discussion_threads view returns which threads are on this page.
//      Grouping happens in the database, so "threads 61 to 90" is a real
//      question with a real answer rather than something reconstructed from
//      however many rows happened to be loaded.
//
//   2. every row belonging to those threads.
//
// A thread is therefore either fully on the page or not on it — never half
// there with an understated reply count, which is what happened when the list
// fetched the newest N rows and grouped them in JS. A thread with 8 posts, 3 of
// them recent, would render as 3 posts and "2 replies" while its own page
// correctly showed 8.
//
// And because the view knows about every thread rather than recent ones, a
// question asked a year ago and never answered is still reachable by paging.
// That is the point: nothing on the site becomes unbrowsable through age.
export async function getThreadPage({ offset = 0, limit = 30 } = {}) {
  const threads = await safeQuery((supabase) =>
    supabase
      .from("discussion_threads")
      .select("topic_slug")
      .order("last_activity", { ascending: false })
      .range(offset, offset + limit - 1)
  );

  const slugs = threads.map((row) => row.topic_slug).filter(Boolean);
  if (!slugs.length) return { rows: [], hasMore: false };

  const rows = await safeQuery((supabase) =>
    supabase
      .from("reviews")
      .select("*")
      .in("topic_slug", slugs)
      .order("created_at", { ascending: false })
  );

  return {
    rows,
    // A full page suggests there is at least one more. Cheaper than a count,
    // and the worst case is a "Load more" that turns up empty once.
    hasMore: threads.length === limit
  };
}

// The most recently active threads, complete. Thin wrapper over the first page
// for callers that never paginate — the homepage grid, mainly.
export async function getRecentThreads({ threads = 30 } = {}) {
  const { rows } = await getThreadPage({ offset: 0, limit: threads });
  return rows;
}

// Every experience belonging to one discussion thread.
//
// The thread page used to call getReviews(200) and filter the result in JS.
// That works while the whole site has under 200 experiences and breaks
// silently after: a thread's own replies drop out of the 200 most recent rows
// site-wide, so an older discussion quietly renders with half its content and
// no error anywhere. Query the slug directly instead — idx_reviews_topic_slug
// makes it one indexed lookup, and there is no ceiling.
//
// Ascending so the opening experience comes first, which is the order
// buildTopics expects when it picks the thread's canonical title.
// Everything in one thread, questions included: the opening question is the
// first thing a visitor should read, so it belongs on the page even though it
// is not an experience. Callers that need to count real answers filter on
// kind themselves.
export async function getReviewsByTopicSlug(slug) {
  if (!slug) return [];
  return safeQuery((supabase) =>
    supabase
      .from("reviews")
      .select("*")
      .eq("topic_slug", slug)
      .order("created_at", { ascending: true })
  );
}

// What the signed-in user has already voted on, as { targetId: choice }.
// Without this the page renders with no idea which cards the user has voted on:
// the buttons come back un-highlighted after every reload and the next click is
// spent re-sending a vote the server already has.
export async function getUserVotes(userId, targetType) {
  if (!userId) return {};
  const rows = await safeQuery((supabase) =>
    supabase
      .from("user_votes")
      .select("target_id, value")
      .eq("user_id", userId)
      .eq("target_type", targetType)
  );
  const map = {};
  for (const row of rows) {
    if (row?.target_id) map[row.target_id] = row.value;
  }
  return map;
}

export async function getSiteStats() {
  return safeQuery((supabase) =>
    supabase.from("site_stats").select("*").order("order", { ascending: true })
  );
}

// Compact display form for the homepage stat strip: exact counts with commas
// below 10K, then "38.4K" style so the big serif numerals stay short.
function formatStatCount(count) {
  if (count >= 10000) {
    const thousands = count / 1000;
    const compact =
      thousands >= 100 ? Math.round(thousands) : Math.round(thousands * 10) / 10;
    return `${compact}K`;
  }
  return count.toLocaleString("en-US");
}

// Homepage counters computed live from the content tables instead of the
// seeded site_stats rows, which remain only as a fallback if any aggregate
// query fails. "Votes cast" counts the user_votes ledger (one row per real
// vote on trending/battles/reviews), not the seeded display counters.
export async function getLiveSiteStats() {
  noStore();
  try {
    const supabase = createServerSupabase();
    const [reviewCount, questionCount, chatCount, voteCount] = await Promise.all([
      // Experiences and questions now share the reviews table, split by kind —
      // so each is counted explicitly rather than one table each.
      supabase
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("kind", "experience"),
      supabase
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("kind", "question"),
      // Kept for the error check below and any future stat; not shown, because
      // an assistant message is not a community question.
      supabase
        .from("chat_messages")
        .select("*", { count: "exact", head: true })
        .eq("role", "user"),
      supabase.from("user_votes").select("*", { count: "exact", head: true })
    ]);

    const failed = [reviewCount, questionCount, chatCount, voteCount]
      .find((result) => result.error);
    if (failed) {
      console.error("Live stats query failed:", failed.error.message);
      return getSiteStats();
    }

    return [
      {
        id: "stat-experiences",
        label: "Experiences shared",
        value: formatStatCount(reviewCount.count || 0)
      },
      {
        id: "stat-questions",
        // "asked", not "answered". This counted community questions plus every
        // message ever typed at the assistant and called the total answered —
        // so the homepage claimed 12 answers while the section below it showed
        // three questions nobody had touched. A number that contradicts what is
        // visible underneath it reads as carelessness, and it is the first
        // thing a visitor can check.
        //
        // Assistant messages are excluded too. They are a different thing from
        // a question asked of the community, and folding them in makes the
        // figure unfalsifiable.
        label: "Questions asked",
        value: formatStatCount(questionCount.count || 0)
      },
      {
        id: "stat-votes",
        label: "Votes cast",
        value: formatStatCount(voteCount.count || 0)
      }
    ];
  } catch (error) {
    console.error("Supabase unavailable:", error?.message || error);
    return getSiteStats();
  }
}

// Niche reel channels for the homepage rail. Falls back to a baked-in set so the
// section always renders, even before the `reels` table is created/seeded.
// Reels store an embeddable link (video_url) — nothing is hosted. video_url here
// is a stable placeholder so the inline player works out of the box; swap these
// for real YouTube/Instagram/TikTok/Vimeo links via /admin/content/reels.
const DEMO_EMBED = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const FALLBACK_REELS = [
  { id: "reel-paisa", tag: "Paisa", title: "IPO ma paisa lagaune ho?", handle: "@kasto_chha_paisa", accent: "#5a1f24", video_url: DEMO_EMBED, channel_url: "https://www.youtube.com/results?search_query=nepal+ipo" },
  { id: "reel-travels", tag: "Travels", title: "ABC Trek kasto chha?", handle: "@kasto_chha_travels", accent: "#143b52", video_url: DEMO_EMBED, channel_url: "https://www.youtube.com/results?search_query=annapurna+base+camp+trek" },
  { id: "reel-motors", tag: "Motors", title: "Deepal S07 first drive", handle: "@kasto_chha_motors", accent: "#6b3110", video_url: DEMO_EMBED, channel_url: "https://www.youtube.com/results?search_query=deepal+s07" },
  { id: "reel-food", tag: "Food", title: "Best momo in Kathmandu", handle: "@kasto_chha_food", accent: "#5c4310", video_url: DEMO_EMBED, channel_url: "https://www.youtube.com/results?search_query=best+momo+kathmandu" },
  { id: "reel-tech", tag: "Tech", title: "iPhone 17 hands-on", handle: "@kasto_chha_tech", accent: "#332a52", video_url: DEMO_EMBED, channel_url: "https://www.youtube.com/results?search_query=iphone+17" }
];

export async function getReels() {
  const rows = await safeQuery((supabase) =>
    supabase.from("reels").select("*").order("order", { ascending: true })
  );
  return rows && rows.length ? rows : FALLBACK_REELS;
}

// Questions posted through the "Ask a KastoChha" modal. These used to be
// write-only — the row was inserted and nothing on the site ever read it back,
// so posting a question looked like it did nothing. They now feed the Experience
// page's open-questions panel and the assistant's "Community is asking" rail.
// Threads that have been asked but not answered — what "Community is asking"
// renders.
//
// A question is a discussion with no experiences under it yet. Both live in
// `reviews`, distinguished by `kind`, so asking and answering land in the same
// place and there is nothing to match up afterwards.
//
// Previously this read a separate `questions` table, and the homepage tried to
// pair a question with its answers by slugifying the whole question text. That
// almost never matched, so every question showed as unanswered no matter how
// many people had replied.
export async function getRecentQuestions(limit = 8) {
  // Pull a wider window than needed: some of these will turn out to be answered
  // and get filtered below, and asking for exactly `limit` would return fewer.
  const questions = await safeQuery((supabase) =>
    supabase
      .from("reviews")
      .select("id, topic, topic_slug, summary, category, created_at")
      .eq("kind", "question")
      .order("created_at", { ascending: false })
      .limit(limit * 4)
  );

  if (!questions.length) return [];

  const slugs = questions.map((item) => item.topic_slug).filter(Boolean);

  // Every experience on those threads, so each can be measured against the
  // same bar the sitemap uses.
  const experiences = await safeQuery((supabase) =>
    supabase
      .from("reviews")
      .select("topic_slug, topic, title, summary")
      .eq("kind", "experience")
      .in("topic_slug", slugs)
  );

  const byslug = new Map();
  for (const row of experiences) {
    if (!byslug.has(row.topic_slug)) byslug.set(row.topic_slug, []);
    byslug.get(row.topic_slug).push(row);
  }

  // A thread leaves "Community is asking" when it clears the indexation gate —
  // the same 2 experiences and ~80 words that decide whether it is worth
  // putting in front of Google.
  //
  // Graduating on the *first* answer would be too early: a thread with one
  // short reply is still thin, still unread, and still needs help. But it would
  // have lost the two prompts that get it help — "Answer this" and the count of
  // what's already there — because those only exist in this section.
  //
  // Tying both to one threshold means the section shows exactly the threads
  // that need something, and a thread becomes a proper discussion and becomes
  // indexable at the same moment. One line, two meanings, no drift between them.
  return questions
    .filter((item) => !isDiscussionIndexable(byslug.get(item.topic_slug) || []))
    .slice(0, limit)
    // `question` keeps the shape QuestionsWall already expects; `answers` lets
    // the card show what is already there rather than always reading zero.
    .map((item) => ({
      id: item.id,
      question: item.summary,
      topic: item.topic,
      topic_slug: item.topic_slug,
      category: item.category,
      created_at: item.created_at,
      answers: (byslug.get(item.topic_slug) || []).length
    }));
}

export async function getHomeData(userId) {
  const [
    trending,
    featured,
    battles,
    reviews,
    stats,
    reels,
    questions,
    trendingVotes,
    battleVotes
  ] = await Promise.all([
    getTrendingTopics(),
    getFeaturedStories(),
    getBattles(),
    // Complete threads: the grid shows six but counts replies across all of
    // them, and a partial thread would report the wrong number.
    getRecentThreads({ threads: 20 }),
    getLiveSiteStats(),
    getReels(),
    getRecentQuestions(6),
    getUserVotes(userId, "trending"),
    getUserVotes(userId, "battle")
  ]);

  return {
    trending,
    featured,
    battles,
    reviews,
    stats,
    reels,
    questions,
    trendingVotes,
    battleVotes
  };
}

// Newest conversations started anywhere on the site (guests included), used for
// the "Community is asking" rail. Titles only — no message bodies leave the
// owner's own sidebar.
export async function getRecentChatTopics(limit = 6) {
  return safeQuery((supabase) =>
    supabase
      .from("chat_topics")
      .select("title, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)
  );
}

// One user's conversations, most recently active first — the chat sidebar.
export async function getUserChatTopics(userId, limit = 6) {
  if (!userId) return [];
  return safeQuery((supabase) =>
    supabase
      .from("chat_topics")
      .select("id, title, message_count, created_at, last_message_at")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("last_message_at", { ascending: false })
      .limit(limit)
  );
}

// Every turn in one conversation, oldest first. Scoped to the owner, so an id
// guessed or replayed by another account returns nothing.
export async function getChatTopicMessages(topicId, userId, limit = 200) {
  if (!topicId || !userId) return [];
  return safeQuery((supabase) =>
    supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("topic_id", topicId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(limit)
  );
}

// Title search over a user's own conversations.
export async function searchUserChatTopics(userId, term, limit = 20) {
  const query = (term || "").trim();
  if (!userId || !query) return [];
  // Strip LIKE wildcards so a typed % or _ can't turn into match-everything.
  const like = `%${query.slice(0, 80).replace(/[%_]/g, " ")}%`;
  return safeQuery((supabase) =>
    supabase
      .from("chat_topics")
      .select("id, title, message_count, created_at, last_message_at")
      .eq("user_id", userId)
      .is("archived_at", null)
      .ilike("title", like)
      .order("last_message_at", { ascending: false })
      .limit(limit)
  );
}
