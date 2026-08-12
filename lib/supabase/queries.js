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

export async function getBattles() {
  return safeQuery((supabase) =>
    supabase.from("battles").select("*").order("order", { ascending: true })
  );
}

export async function getReviews(limit = 200) {
  return safeQuery((supabase) =>
    supabase
      .from("reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)
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
      supabase.from("reviews").select("*", { count: "exact", head: true }),
      supabase.from("questions").select("*", { count: "exact", head: true }),
      // Questions asked of the assistant = user turns, not whole conversations.
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
        label: "Questions answered",
        value: formatStatCount((questionCount.count || 0) + (chatCount.count || 0))
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

export async function getHomeData(userId) {
  const [
    trending,
    featured,
    battles,
    reviews,
    stats,
    reels,
    trendingVotes,
    battleVotes
  ] = await Promise.all([
    getTrendingTopics(),
    getFeaturedStories(),
    getBattles(),
    getReviews(40),
    getLiveSiteStats(),
    getReels(),
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
