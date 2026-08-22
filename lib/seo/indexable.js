// ---------------------------------------------------------------------------
// What search engines are allowed to index.
//
// Two sections of KastoChha are built to rank: Discussions (community
// experiences that accumulate over time) and Featured (researched articles).
// Trending, Battle and the answer engine are engagement surfaces — Trending
// and Battle topics live two or three days, and chat conversations are not
// content in the first place.
//
// Why any of this matters, given the site is small:
//
// Google evaluates quality partly at the domain level, and hardest on new
// domains with no backlinks. A dozen near-empty pages sitting beside twenty
// good ones doesn't cost nothing — it drags on the signal that decides whether
// the good ones get taken seriously at all. Search Console shows this domain
// has had exactly one page indexed since January, so the crawl budget being
// spent here is tiny. It should go on the pages that can actually rank.
//
// Nothing here is permanent. A gated page still gets crawled and still passes
// link equity ("follow"), it just isn't competing yet. When it earns enough
// substance the gate opens on its own at the next build — no manual step.
// ---------------------------------------------------------------------------

// Rough but adequate: what matters is telling one line apart from a paragraph,
// not counting precisely.
export function wordCount(text) {
  if (!text) return 0;
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

// Placeholder text that reached production during development ("abc", "aaaaa",
// "xyz vs pqr"). Cheap to check, and stops a seeded row being indexed if one
// slips through again.
//
// Anchored at both ends deliberately. An unanchored `a+` matches the first
// letter of "Ali battery ko issue raichha" and would gate a perfectly good
// thread as junk — a placeholder is the *entire* content, not a prefix of it.
const PLACEHOLDER = /^(abc+|a+|x+|z+|test\d*|xyz|pqr|lorem(\s+ipsum)?)$/i;

export function looksLikePlaceholder(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return true;
  return PLACEHOLDER.test(trimmed);
}

// A discussion thread earns indexing once it's a conversation rather than a
// single stray opinion. Two thresholds, both of which have to pass:
//
//   - at least 2 experiences: one person's sentence is not a discussion, and
//     it's also the shape most likely to be abandoned
//   - at least 80 words across the thread: enough to actually answer whatever
//     someone searched for
//
// Sampled threads currently run about 110 words, so this is a floor rather
// than a stretch.
export const DISCUSSION_MIN_EXPERIENCES = 2;
export const DISCUSSION_MIN_WORDS = 80;

export function isDiscussionIndexable(experiences = []) {
  if (experiences.length < DISCUSSION_MIN_EXPERIENCES) return false;

  const text = experiences
    .map((item) => `${item?.topic || item?.title || ""} ${item?.summary || ""}`)
    .join(" ");

  if (looksLikePlaceholder(text)) return false;
  return wordCount(text) >= DISCUSSION_MIN_WORDS;
}

// Featured stories are written, not contributed, so the bar is a real article
// rather than a card. Stories whose link_url sends the reader off-site have no
// body of their own and shouldn't be indexed as if they did.
export const FEATURED_MIN_WORDS = 300;

export function isFeaturedIndexable(story) {
  if (!story) return false;
  const body = story.body || "";
  if (looksLikePlaceholder(body)) return false;
  return wordCount(body) >= FEATURED_MIN_WORDS;
}

// ---------------------------------------------------------------------------
// Metadata helpers
//
// Use these in a page's `metadata` export or its generateMetadata return, so
// the meta robots tag and the sitemap always agree. Disagreement between the
// two is its own ranking problem: a URL listed in the sitemap but tagged
// noindex is a contradictory signal.
// ---------------------------------------------------------------------------

// Crawl it, don't list it. Links on the page still pass equity, so a noindexed
// Trending page still feeds the discussions it links to.
export const NOINDEX_FOLLOW = { index: false, follow: true };

// Neither index nor follow — for admin screens and auth pages, where there is
// nothing beyond worth crawling.
export const NOINDEX_NOFOLLOW = { index: false, follow: false };

export function robotsFor(indexable) {
  return indexable ? { index: true, follow: true } : NOINDEX_FOLLOW;
}
