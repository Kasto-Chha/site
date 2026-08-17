"use client";

import ShareRow from "./ShareRow";
import { avatarStack, catLabel, catTone, delayClass, formatTimeAgo } from "./sectionHelpers";
import { IconThumb } from "./icons";
import { topicSlug } from "../../lib/slug";

const AV_CLASSES = ["av-a", "av-b", "av-c"];

const slugOf = (review) =>
  review.topic_slug || topicSlug(review.topic || review.title) || "general";

// Community discussions grid, built from the shared `reviews` pool. Each card
// is a "kasto chha?" thread with a participant avatar stack, a quoted opener,
// and reply / upvote / time meta. Clicking a card opens the full thread page.
export default function DiscussionsGrid({ reviews = [], limit = 6 }) {
  const items = reviews.slice(0, limit);

  // Real reply counts: how many other experiences share each card's topic
  // within the loaded pool (rather than the seeded comment_count column).
  const threadSize = new Map();
  for (const review of reviews) {
    const slug = slugOf(review);
    threadSize.set(slug, (threadSize.get(slug) || 0) + 1);
  }

  if (items.length === 0) {
    return (
      <div className="disc-grid">
        <article className="disc-card empty-card">
          <h3 className="disc-title">No discussions yet</h3>
          <p className="disc-quote">Share an experience to start the first thread.</p>
        </article>
      </div>
    );
  }

  return (
    <div className="disc-grid">
      {items.map((review, index) => {
        const tone = catTone(review.category);
        const replies = Math.max((threadSize.get(slugOf(review)) || 1) - 1, 0);
        const likes = review.upvotes || 0;
        const time = formatTimeAgo(review.created_at);
        const stack = avatarStack(review.author_name, 3);

        return (
          <article className={`disc-card bento-card ${delayClass(index)}`} key={review.id}>
            <div className="disc-top">
              <div className="disc-cat" style={{ color: tone }}>
                <span className="tcard-glyph" style={{ background: tone }} aria-hidden />
                {catLabel(review.category)}
              </div>
              <div className="disc-avatars" aria-hidden>
                {stack.map((ch, i) => (
                  <span className={`disc-av ${AV_CLASSES[i % AV_CLASSES.length]}`} key={i}>{ch}</span>
                ))}
              </div>
            </div>

            <h3 className="disc-title">
              <a className="disc-link" href={`/discussions/${review.id}`}>
                {review.title || review.topic}
              </a>
            </h3>
            {review.summary ? <p className="disc-quote">&ldquo;{review.summary}&rdquo;</p> : null}

            <div className="disc-divider" />

            <div className="disc-foot">
              <span className="disc-replies">{replies} {replies === 1 ? "reply" : "replies"}</span>
              <span className="disc-likes"><IconThumb className="icon" /> {likes}</span>
              {time ? <span className="disc-time">{time}</span> : null}
            </div>

            <ShareRow
              text={review.title || review.topic || "KastoChha discussion"}
              url={`/discussions/${review.id}`}
              label="Share"
            />
          </article>
        );
      })}
    </div>
  );
}
