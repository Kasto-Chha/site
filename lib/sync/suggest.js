import { ilikeAnyClause, relevanceScore } from "../search";
import { kindDisplay } from "./businessTypes";
import { pinnedTitle } from "./threadPage";
import { merchantTitle } from "./slug";

// Businesses in the Share box's topic suggestions. A customer typing "Test Cafe" should be
// offered the cafe's own thread, including one that has no posts yet (the suggestions come
// from posts, so it would never appear), and one a business is tagged to should be named
// for the business. Server-only.
//
// An entry's `title` is what a post must be sent under to land in that thread (the pinned
// title), because picking a suggestion puts that title in the form. `label` is what is shown.

const COLUMNS = "slug, topic_slug, business_name, area, business_kind, kind_label, category, thread_title, status";
const MAX_BUSINESSES = 3;
const MAX_TOTAL = 6;

export function businessEntry(merchant, thread = null) {
  return {
    ...(thread || {}),
    slug: merchant.topic_slug,
    title: pinnedTitle(merchant),
    category: merchant.category || (thread && thread.category) || "",
    label: merchantTitle(merchant),
    business: true,
    kindName: kindDisplay(merchant.business_kind, merchant.kind_label),
    area: merchant.area,
    experiences: thread ? thread.experiences : 0,
    question: thread ? thread.question : null
  };
}

// `threads` are the suggestions made from posts (at most five). Returns them with any business
// threads named for the business and put first, plus matching businesses that have no posts.
// A failure here never takes the ordinary suggestions away: businesses are an aid.
export async function withBusinesses(supabase, tokens, threads) {
  const base = Array.isArray(threads) ? threads : [];
  try {
    const slugs = base.map((t) => t.slug).filter(Boolean);
    const [matched, annotated] = await Promise.all([
      tokens.length
        ? supabase.from("sync_merchants").select(COLUMNS).eq("status", "active").or(ilikeAnyClause(tokens, ["business_name", "area", "thread_title"])).limit(50)
        : Promise.resolve({ data: [], error: null }),
      slugs.length
        ? supabase.from("sync_merchants").select(COLUMNS).eq("status", "active").in("topic_slug", slugs)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (matched.error) throw new Error(matched.error.message);
    if (annotated.error) throw new Error(annotated.error.message);

    const bySlug = new Map();
    for (const merchant of annotated.data || []) bySlug.set(merchant.topic_slug, { merchant, score: Infinity });
    for (const merchant of matched.data || []) {
      const score = relevanceScore(tokens, { heading: `${merchant.business_name} ${merchant.area}`, body: merchant.thread_title || "" });
      if (score <= 0) continue; // the database's filter is generous; this is where it is tightened
      const known = bySlug.get(merchant.topic_slug);
      if (!known) bySlug.set(merchant.topic_slug, { merchant, score });
    }

    const threadBySlug = new Map(base.map((t) => [t.slug, t]));
    const businesses = [...bySlug.values()]
      .sort((a, b) => (b.score === a.score ? a.merchant.business_name.localeCompare(b.merchant.business_name) : b.score - a.score))
      .slice(0, MAX_BUSINESSES)
      .map(({ merchant }) => businessEntry(merchant, threadBySlug.get(merchant.topic_slug) || null));

    const taken = new Set(businesses.map((b) => b.slug));
    return [...businesses, ...base.filter((t) => !taken.has(t.slug))].slice(0, Math.max(MAX_TOTAL, base.length));
  } catch (error) {
    console.warn("[topics/search] businesses unavailable:", error?.message || error);
    return base;
  }
}
