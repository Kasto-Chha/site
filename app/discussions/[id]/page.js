import { auth } from "@clerk/nextjs/server";

import SiteNav from "../../components/SiteNav";
import SharePanel from "../../components/SharePanel";
import ThreadClient from "./ThreadClient";
import { getReviewById, getReviews, getUserVotes } from "../../../lib/supabase/queries";
import { topicSlug } from "../../../lib/slug";
import { shareMetadata } from "../../../lib/share";

export const dynamic = "force-dynamic";

// Same slug fallback buildTopics uses, so this page groups identically to the
// Experience wall even for rows created before the topic_slug column existed.
const slugOf = (review) =>
  review.topic_slug || topicSlug(review.topic || review.title) || "general";

export async function generateMetadata({ params }) {
  const review = await getReviewById(params.id);
  if (!review) return { title: "Discussion not found - KastoChha" };
  const likes = review.upvotes || 0;
  return shareMetadata({
    type: "discussions",
    path: `/discussions/${review.id}`,
    title: review.topic || review.title || "KastoChha discussion",
    description: review.summary,
    kicker: review.category,
    stat: `${likes} likes`
  });
}

export default async function DiscussionThreadPage({ params }) {
  const review = await getReviewById(params.id);

  if (!review) {
    return (
      <>
        <SiteNav />
        <div className="page-hero"><div className="page-shell"><h1 className="page-title">Discussion not found</h1>
          <p className="page-sub">It may have been removed. <a href="/experience">Browse discussions →</a></p></div></div>
      </>
    );
  }

  // Pull the whole thread: every experience sharing this review's topic slug.
  const { userId } = await auth();
  const [pool, myVotes] = await Promise.all([
    getReviews(200),
    getUserVotes(userId, "review")
  ]);
  const slug = slugOf(review);
  const thread = pool.filter((item) => slugOf(item) === slug);
  if (!thread.some((item) => item.id === review.id)) {
    thread.push(review);
  }
  const replies = thread.length - 1;

  return (
    <>
      <SiteNav />
      <div className="page-hero">
        <div className="page-glow"></div>
        <div className="page-shell">
          <div className="page-head">
            <div>
              <div className="page-kicker">{review.category}</div>
              <h1 className="page-title">{review.topic || review.title}</h1>
              <p className="page-sub">
                {thread.length} experience{thread.length === 1 ? "" : "s"} ·{" "}
                {replies} {replies === 1 ? "reply" : "replies"} — read what the
                community says, vote, and add your own.
              </p>
            </div>
            <a className="sec-all" href="/experience">All discussions -&gt;</a>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="permalink-single" style={{ maxWidth: 760 }}>
          <ThreadClient reviews={thread} threadSlug={slug} myVotes={myVotes} />
          <SharePanel
            url={`/discussions/${review.id}`}
            text={review.topic || review.title || "KastoChha discussion"}
            heading="Share this discussion"
          />
        </div>
      </section>
    </>
  );
}
