import {
  getAllReviewsForSitemap,
  getFeaturedStories
} from "../../lib/supabase/queries";
import { topicSlug } from "../../lib/slug";
import { isDiscussionIndexable, isFeaturedIndexable } from "../../lib/seo/indexable";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// The sitemap is the strongest signal available for restarting crawl.
//
// Search Console shows this sitemap was submitted on 15 Jan 2026 and read once,
// that day. Nothing since. Googlebot last crawled any page here on 9 Apr. The
// site went up, published ten articles, never changed again, and Google stopped
// visiting — crawl frequency follows how often a site actually changes.
//
// Two things were wrong with the old version of this file:
//
//   1. It listed ten static routes and none of the actual content. Every
//      discussion and featured page depended entirely on Googlebot crawling
//      its way there from a link.
//   2. No lastmod anywhere, so re-reading the file told Google nothing about
//      what had changed.
//
// Both are fixed below. Content pages are listed, with real lastmod dates, and
// filtered through the same gate that sets each page's robots tag — so the
// sitemap and the meta tags never contradict each other.
// ---------------------------------------------------------------------------

const STATIC_PATHS = [
  "",
  "/featured",
  "/discussions",
  // The Trending and Battle *index* pages are listed and indexable: they are
  // stable landing pages for their sections. The individual topics under them
  // are not — those rotate out within days. See trending/[id]/page.js.
  "/trending",
  "/battle",
  "/about",
  "/contact",
  "/guidelines",
  // /terms serves the same combined document and canonicals to /privacy, so
  // only the canonical URL is listed here.
  "/privacy"
];

// Deliberately absent from the list above:
//
//   /chat            - conversations, not content, and noindexed
//   /trending/{id}   - a topic lives 2-3 days; distribution is social
//   /battle/{id}     - same; the evergreen comparison belongs in Featured
//   /admin/*         - staff screens
//   /sign-in, /sign-up - auth
//
// These stay linked and crawlable (noindex, follow), they are just not put
// forward as pages worth listing.

// When a thread last genuinely changed.
//
// An experience can be edited after it is posted (app/api/reviews/[id] PATCH),
// so created_at alone under-reports: a five-month-old experience rewritten
// yesterday changed the page yesterday. updated_at is set by a trigger that
// fires on content edits only — never on votes, which touch the same row — so
// taking the later of the two is honest in both directions.
//
// Null updated_at means "never edited", which is every row predating migration
// 0009.
function changedAt(review) {
  const created = review.created_at;
  if (!review.updated_at) return created;
  return new Date(review.updated_at) > new Date(created) ? review.updated_at : created;
}

function entry(loc, lastmod) {
  const lastmodTag = lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : "";
  return `<url><loc>${loc}</loc>${lastmodTag}</url>`;
}

const slugOf = (review) =>
  review.topic_slug || topicSlug(review.topic || review.title) || "general";

// Group experiences into the threads they actually render as, so the sitemap
// lists one URL per topic - matching the routing change in patch 0002, where
// a topic stopped having one URL per reply.
//
// This is the deduplication step. reviews is one row per *experience*, so four
// people writing about the iPhone 17 arrive as four rows sharing one
// topic_slug. Keying a Map on that slug collapses them to a single thread, and
// therefore a single <url> entry — listing the same page four times would be a
// duplicate-content signal in the one file whose job is to state, precisely,
// what pages exist.
function buildThreads(reviews) {
  const threads = new Map();

  for (const review of reviews) {
    const slug = slugOf(review);
    const existing = threads.get(slug);
    if (existing) {
      existing.experiences.push(review);
      // lastmod is the maximum across the thread, not whichever row happened to
      // arrive last — rows can come back in any order and the answer must not
      // depend on that.
      const changed = changedAt(review);
      if (new Date(changed) > new Date(existing.lastmod)) {
        existing.lastmod = changed;
      }
    } else {
      threads.set(slug, {
        slug,
        experiences: [review],
        lastmod: changedAt(review)
      });
    }
  }

  return [...threads.values()];
}

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // A sitemap is the one file where getting the host wrong is fatal rather than
  // untidy: submitting URLs pointing at localhost hands Googlebot a list of
  // addresses it cannot reach. Say so loudly rather than shipping it quietly.
  if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_SITE_URL) {
    console.error(
      "[sitemap] NEXT_PUBLIC_SITE_URL is not set. The sitemap is being generated " +
        "with localhost URLs and must not be submitted to Search Console."
    );
  }

  const [reviews, featured] = await Promise.all([
    // Paginated rather than one large .limit(): PostgREST caps responses at the
    // "Max Rows" value configured in Supabase regardless of what limit asks
    // for, so a single big request would silently return only the first page
    // once the site grows. See getAllReviewsForSitemap.
    getAllReviewsForSitemap(),
    getFeaturedStories()
  ]);

  const urls = [...STATIC_PATHS.map((path) => entry(`${siteUrl}${path}`))];

  for (const thread of buildThreads(reviews)) {
    if (!isDiscussionIndexable(thread.experiences)) continue;
    urls.push(entry(`${siteUrl}/discussions/${thread.slug}`, thread.lastmod));
  }

  for (const story of featured) {
    if (!isFeaturedIndexable(story)) continue;
    // Stories with a link_url point off-site; there is no page of ours to list.
    if (story.link_url) continue;
    urls.push(
      entry(
        `${siteUrl}/featured/${story.slug || story.id}`,
        // updated_at is maintained by a trigger and reflects genuine edits, so
        // fixing a typo in an old article is an honest signal that it changed.
        story.updated_at || story.created_at
      )
    );
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml" }
  });
}
