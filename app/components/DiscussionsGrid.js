"use client";

import ShareRow from "./ShareRow";
import {
  avatarStack,
  catLabel,
  catTone,
  delayClass,
  formatTimeAgo,
  isoTime
} from "./sectionHelpers";
import { IconThumb } from "./icons";
import { topicSlug } from "../../lib/slug";

const AV_CLASSES = ["av-a", "av-b", "av-c"];

const slugOf = (review) =>
  review.topic_slug || topicSlug(review.topic || review.title) || "general";

// Community discussions grid, built from the shared `reviews` pool. Each card
// is a "kasto chha?" thread with a participant avatar stack, a quoted opener,
// and reply / upvote / time meta. Clicking a card opens the full thread page.
export default function DiscussionsGrid({ reviews = [], limit = 6 }) {
  // Real reply counts: how many other rows share each card's topic within the
  // loaded pool (rather than the seeded comment_count column).
  const threadSize = new Map();
  for (const review of reviews) {
    const slug = slugOf(review);
    threadSize.set(slug, (threadSize.get(slug) || 0) + 1);
  }

  // One card per THREAD, not per row.
  //
  // This used to slice the raw list, so a thread with three replies produced
  // three identical cards all linking to the same page — the grid looked like
  // it held six discussions when it held two. The newest row represents each
  // thread, since reviews arrive newest-first and that is the most recent
  // thing said on it.
  const seen = new Set();
  const items = [];
  for (const review of reviews) {
    const slug = slugOf(review);
    if (seen.has(slug)) continue;
    seen.add(slug);
    items.push(review);
    if (items.length >= limit) break;
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
              <a className="disc-link" href={`/discussions/${slugOf(review)}`}>
                {review.title || review.topic}
              </a>
            </h3>
            {/* The quote exists to show what someone SAID about the topic, so it
                has to differ from the heading. On a question row they are the
                same text — the question is both the thread's name and its
                opening post — and printing it twice reads as a stutter. */}
            {review.summary && review.kind !== "question" ? (
              <p className="disc-quote">&ldquo;{review.summary}&rdquo;</p>
            ) : null}

            <div className="disc-divider" />

            <div className="disc-foot">
              <span className="disc-replies">{replies} {replies === 1 ? "reply" : "replies"}</span>
              <span className="disc-likes"><IconThumb className="icon" /> {likes}</span>
              {time ? (
                <time className="disc-time" dateTime={isoTime(review.created_at)}>
                  {time}
                </time>
              ) : null}
            </div>

            <ShareRow
              text={review.title || review.topic || "KastoChha discussion"}
              url={`/discussions/${slugOf(review)}`}
              label="Share"
            />
          </article>
        );
      })}
    </div>
  );
}
