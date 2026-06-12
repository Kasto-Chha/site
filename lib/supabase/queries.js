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

export async function getSnapshots() {
  return safeQuery((supabase) =>
    supabase.from("snapshots").select("*").order("order", { ascending: true })
  );
}

export async function getTrendingTopics() {
  return safeQuery((supabase) =>
    supabase.from("trending_topics").select("*").order("rank", { ascending: true })
  );
}

export async function getPopularTopics() {
  return safeQuery((supabase) =>
    supabase.from("popular_topics").select("*").order("rank", { ascending: true })
  );
}

export async function getFeaturedStories() {
  return safeQuery((supabase) =>
    supabase.from("featured_stories").select("*").order("slot", { ascending: true })
  );
}

export async function getBattles() {
  return safeQuery((supabase) =>
    supabase.from("battles").select("*").order("order", { ascending: true })
  );
}

export async function getExperienceWall() {
  return safeQuery((supabase) =>
    supabase
      .from("experiences")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(8)
  );
}

export async function getReviews() {
  return safeQuery((supabase) =>
    supabase
      .from("reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
  );
}

export async function getSiteStats() {
  return safeQuery((supabase) =>
    supabase.from("site_stats").select("*").order("order", { ascending: true })
  );
}

export async function getBlogPosts() {
  return safeQuery((supabase) =>
    supabase
      .from("blog_posts")
      .select("*")
      .eq("status", "published")
      .order("published_at", { ascending: false })
  );
}

export async function getBlogPostBySlug(slug) {
  return safeQuery(
    (supabase) =>
      supabase
        .from("blog_posts")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .single(),
    null
  );
}

export async function getBlogPostsForSitemap() {
  return safeQuery((supabase) =>
    supabase
      .from("blog_posts")
      .select("slug, updated_at, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
  );
}

export async function getBlogComments(postId) {
  return safeQuery((supabase) =>
    supabase
      .from("blog_comments")
      .select("*")
      .eq("post_id", postId)
      .eq("status", "published")
      .order("created_at", { ascending: true })
  );
}

export async function getHomeData() {
  const [snapshots, trending, popular, featured, battles, experiences, stats] = await Promise.all([
    getSnapshots(),
    getTrendingTopics(),
    getPopularTopics(),
    getFeaturedStories(),
    getBattles(),
    getExperienceWall(),
    getSiteStats()
  ]);

  return {
    snapshots,
    trending,
    popular,
    featured,
    battles,
    experiences,
    stats
  };
}

export async function getRecentChatQueries(limit = 6) {
  return safeQuery((supabase) =>
    supabase
      .from("chat_queries")
      .select("query, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)
  );
}

export async function getUserChatQueries(userId, limit = 6) {
  if (!userId) return [];
  return safeQuery((supabase) =>
    supabase
      .from("chat_queries")
      .select("query, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
  );
}
