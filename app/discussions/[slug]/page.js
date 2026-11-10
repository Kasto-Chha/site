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
import { shareMetadata, threadShareInfo } from "../../../lib/share";
import { getMerchantByTopicSlug } from "../../../lib/sync/merchants";
import { businessMetadata, businessPageFacts, pinnedTitle, experiencesOnly, threadCountsLine } from "../../../lib/sync/threadPage";
import BusinessHeader from "./BusinessHeader";
import AskComposer from "./AskComposer";
import FirstPostComposer from "./FirstPostComposer";
import { requireRole, ROLE } from "../../../lib/auth/roles";
import { createServerSupabase } from "../../../lib/supabase/server";
import { isOwnerOf, repliesForReviews } from "../../../lib/sync/ownerReplies";
import "./business.css";
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
    // Stored slugs are always lowercase (topicSlug() in lib/slug.js forces
    // this), but a visitor can arrive with different casing — typed from
    // memory, or retyped by an external source instead of copy-pasted. A
    // case-sensitive match against the database would silently 404 on a
    // thread that genuinely exists. Canonicalizing here fixes the lookup;
    // redirecting (like the uuid case below) keeps one single URL as the
    // real one rather than leaving mixed-case duplicates un-redirected.
    const canonical = raw.toLowerCase();
    return { slug: canonical, redirect: canonical !== raw };
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

  const [thread, merchant] = await Promise.all([getReviewsByTopicSlug(slug), getMerchantByTopicSlug(slug)]);
  if (!thread.length && !merchant) return { title: "Discussion not found - KastoChha" };

  // A thread a business has been tagged to is called by the business's name, and one with no
  // posts yet is still a page (kept out of search engines until it has some).
  if (merchant) return businessMetadata({ slug, merchant, thread });

  const op = thread[0];
  const title = op.topic || op.title || "KastoChha discussion";
  const card = threadShareInfo(thread, title);

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
      description: card.description,
      kicker: op.category,
      // The card's pill and label: experiences shared, or, for a thread that opens
      // with a question, how many answers it has so far.
      stat: card.stat,
      kind: card.kind
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
  const [thread, myVotes, merchant] = await Promise.all([
    slug ? getReviewsByTopicSlug(slug) : Promise.resolve([]),
    getUserVotes(userId, "review"),
    slug ? getMerchantByTopicSlug(slug) : Promise.resolve(null),
  ]);
  const biz = merchant ? businessPageFacts(merchant) : null;

  // A business's replies under its posts. The page shows them to everyone; only the account linked to the
  // business gets the way to write one, and a team member the way to remove one. Both are decided here, on the
  // server, from the signed-in account: the browser is only told the answer, never who the owner is. A reply
  // that cannot be read is left out, and the page still works.
  let ownerReplies = {};
  let canReplyAsOwner = false;
  let canModerate = false;
  if (merchant) {
    canReplyAsOwner = isOwnerOf(merchant, userId);
    if (thread.length) {
      try {
        ownerReplies = await repliesForReviews(createServerSupabase(), thread.map((post) => post.id));
      } catch {
        ownerReplies = {};
      }
    }
    if (userId && !canReplyAsOwner) canModerate = (await requireRole(ROLE.ADMIN)).ok;
  }

  // A business that has been tagged but has no posts yet: its header and an invitation to be
  // first, instead of "not found".
  if (!thread.length && biz) {
    return (
      <>
        <SiteNav />
        <div className="page-hero">
          <div className="page-glow"></div>
          <div className="page-shell">
            <div className="page-head">
              <div>
                <div className="page-kicker">{biz.category}</div>
                <h1 className="page-title">{biz.name}</h1>
                <p className="page-sub">
                  Nobody has shared an experience here yet. Be the first to tell Nepal what it is really like.
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
            <BusinessHeader facts={biz} />
            <FirstPostComposer
              slug={slug}
              postTitle={pinnedTitle(merchant)}
              category={biz.category}
              businessName={biz.name}
              businessSlug={merchant.slug}
              googleUrl={biz.reviewUrl}
            />
            <AskComposer slug={slug} postTitle={pinnedTitle(merchant)} category={biz.category} businessName={biz.name} defaultOpen />
            <SharePanel url={`/discussions/${slug}`} text={biz.title} heading="Share this business" />
          </div>
        </section>
      </>
    );
  }

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
  const title = biz ? biz.title : op.topic || op.title || "KastoChha discussion";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // DiscussionForumPosting is the type Google documents for a thread: an
  // opening post with replies attached. Describing this as an Article would
  // misrepresent it — nobody wrote it, a community accumulated it.
  const schema = jsonLd(
    // On a business's page the data describes what customers shared: its questions are not experiences.
    discussionSchema(siteUrl, { slug, title, experiences: biz ? experiencesOnly(thread) : thread }),
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
              <div className="page-kicker">{biz ? biz.category : op.category}</div>
              <h1 className="page-title">{biz ? biz.name : title}</h1>
              <p className="page-sub">
                {threadCountsLine(thread, { business: Boolean(biz) })} — read what the community says, vote, and add
                your own.
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
          {biz ? (
            <>
              <BusinessHeader facts={biz} />
              <AskComposer slug={slug} postTitle={pinnedTitle(merchant)} category={biz.category} businessName={biz.name} />
              <div id="share">
                <ThreadClient
                  key={thread.map((post) => post.id).join(",")}
                  reviews={thread}
                  threadSlug={slug}
                  myVotes={myVotes}
                  displayTitle={biz.title}
                  displayCategory={biz.category}
                  googleUrl={biz.reviewUrl}
                  businessSlug={merchant.slug}
                  ownerReplies={ownerReplies}
                  ownerName={biz.name}
                  canReplyAsOwner={canReplyAsOwner}
                  canModerate={canModerate}
                />
              </div>
            </>
          ) : (
            <ThreadClient reviews={thread} threadSlug={slug} myVotes={myVotes} />
          )}
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
