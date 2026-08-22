import { auth } from "@clerk/nextjs/server";
import { permanentRedirect } from "next/navigation";

import SiteNav from "../../components/SiteNav";
import SharePanel from "../../components/SharePanel";
import ThreadClient from "./ThreadClient";
import {
  getReviewById,
  getReviewsByTopicSlug,
  getUserVotes,
} from "../../../lib/supabase/queries";
import { topicSlug } from "../../../lib/slug";
import { shareMetadata } from "../../../lib/share";
import { isDiscussionIndexable, robotsFor } from "../../../lib/seo/indexable";
import {
  breadcrumbSchema,
  discussionSchema,
  jsonLd
} from "../../../lib/seo/schema";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// One topic, one URL.
//
// This route used to be /discussions/[id], where [id] was a single experience's
// uuid. Because the page renders the whole thread, every reply to a topic
// produced another URL showing identical content — "Sikko Calculator" existed
// at two addresses, the Morbidelli thread at three. Each declared itself
// canonical, so Google saw duplicates competing with each other and any credit
// the topic earned was split between them. It also grew: a thread with 40
// replies would have meant 40 copies of the same page.
//
// The URL is now the topic slug, which every experience in a thread already
// shares. Old uuid links keep working — see resolveSlug below.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Turns whatever is in the URL into a topic slug.
//
// Returns { slug, redirect } — redirect is true when the visitor arrived on an
// old uuid link and should be sent to the canonical topic URL instead.
async function resolveSlug(param) {
  const raw = decodeURIComponent(param || "");

  if (!UUID_RE.test(raw)) {
    return { slug: raw, redirect: false };
  }

  // An old per-experience link, still live in shared posts and old messages.
  // Look the row up once, then hand back its thread's slug so the caller can
  // 301 rather than 404.
  const review = await getReviewById(raw);
  if (!review) return { slug: null, redirect: false };

  const slug = review.topic_slug || topicSlug(review.topic || review.title);
  return { slug: slug || null, redirect: Boolean(slug) };
}

export async function generateMetadata({ params }) {
  const { slug } = await resolveSlug(params.slug);
  if (!slug) return { title: "Discussion not found - KastoChha" };

  const thread = await getReviewsByTopicSlug(slug);
  if (!thread.length) return { title: "Discussion not found - KastoChha" };

  const op = thread[0];
  const title = op.topic || op.title || "KastoChha discussion";
  const likes = thread.reduce((sum, item) => sum + (item.upvotes || 0), 0);

  // A thread with one short reply cannot answer whatever someone searched for,
  // and a pile of those drags on how the whole domain is judged. So indexing is
  // earned, not automatic: two experiences and 80 words, checked at build time.
  // Below that it stays crawlable and still passes link equity — it just isn't
  // competing yet. When the thread grows, the gate opens by itself.
  const indexable = isDiscussionIndexable(thread);

  return {
    ...shareMetadata({
      type: "discussions",
      // Always the topic URL, never the uuid the visitor may have arrived on.
      // This is the tag that tells Google which single address to credit.
      path: `/discussions/${slug}`,
      title,
      // Previously this was op.summary — one contributor's sentence, which meant
      // the search snippet for the whole thread was a single random opinion
      // ("Ali battery ko issue raichha"). Describe the thread instead.
      description: `${thread.length} ${
        thread.length === 1 ? "experience" : "experiences"
      } shared on ${title} — real opinions from people in Nepal, with votes and replies.`,
      kicker: op.category,
      stat: `${likes} likes`
    }),
    robots: robotsFor(indexable)
  };
}

export default async function DiscussionThreadPage({ params }) {
  const { slug, redirect } = await resolveSlug(params.slug);

  // 301 so the old uuid link passes its credit to the topic URL rather than
  // competing with it. permanentRedirect throws, so nothing below runs.
  if (redirect && slug) permanentRedirect(`/discussions/${slug}`);

  const { userId } = await auth();
  const [thread, myVotes] = await Promise.all([
    slug ? getReviewsByTopicSlug(slug) : Promise.resolve([]),
    getUserVotes(userId, "review"),
  ]);

  if (!thread.length) {
    return (
      <>
        <SiteNav />
        <div className="page-hero">
          <div className="page-shell">
            <h1 className="page-title">Discussion not found</h1>
            <p className="page-sub">
              It may have been removed.{" "}
              <a href="/discussions">Browse discussions →</a>
            </p>
          </div>
        </div>
      </>
    );
  }

  // Oldest first, so the opening experience carries the thread's title.
  const op = thread[0];
  const replies = thread.length - 1;
  const title = op.topic || op.title || "KastoChha discussion";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // DiscussionForumPosting is the type Google documents for a thread: an
  // opening post with replies attached. Describing this as an Article would
  // misrepresent it — nobody wrote it, a community accumulated it.
  const schema = jsonLd(
    discussionSchema(siteUrl, { slug, title, experiences: thread }),
    breadcrumbSchema(siteUrl, [
      { name: "Discussions", path: "/discussions" },
      { name: title, path: `/discussions/${slug}` }
    ])
  );

  return (
    <>
      <SiteNav />
      {schema ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schema }} />
      ) : null}
      <div className="page-hero">
        <div className="page-glow"></div>
        <div className="page-shell">
          <div className="page-head">
            <div>
              <div className="page-kicker">{op.category}</div>
              <h1 className="page-title">{title}</h1>
              <p className="page-sub">
                {thread.length} experience{thread.length === 1 ? "" : "s"} ·{" "}
                {replies} {replies === 1 ? "reply" : "replies"} — read what the
                community says, vote, and add your own.
              </p>
            </div>
            <a className="sec-all" href="/discussions">
              All discussions -&gt;
            </a>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="permalink-single" style={{ maxWidth: 760 }}>
          <ThreadClient reviews={thread} threadSlug={slug} myVotes={myVotes} />
          <SharePanel
            url={`/discussions/${slug}`}
            text={title}
            heading="Share this discussion"
          />
        </div>
      </section>
    </>
  );
}
