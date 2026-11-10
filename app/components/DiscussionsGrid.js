"use client";

import ShareRow from "./ShareRow";
import {
  catLabel,
  catTone,
  delayClass,
  formatTimeAgo,
  initials,
  isoTime
} from "./sectionHelpers";
import { IconThumb } from "./icons";
import { topicSlug } from "../../lib/slug";
import "./businessChip.css";
import { pickCards } from "../../lib/homeCards";

const AV_CLASSES = ["av-a", "av-b", "av-c"];

const slugOf = (review) =>
  review.topic_slug || topicSlug(review.topic || review.title) || "general";

// Community discussions grid, built from the shared `reviews` pool. Each card
// is a "kasto chha?" thread with a participant avatar stack, a quoted opener,
// and reply / upvote / time meta. Clicking a card opens the full thread page.
export default function DiscussionsGrid({ reviews = [], limit = 6, businesses = {} }) {
  // Real reply counts: how many other rows share each card's topic within the
  // loaded pool (rather than the seeded comment_count column). The same pass
  // collects each thread's distinct authors for the avatar stack, newest first.
  const participants = new Map();
  for (const review of reviews) {
    const slug = slugOf(review);
    const name = (review.author_name || "").trim();
    if (!name) continue;
    if (!participants.has(slug)) participants.set(slug, []);
    const names = participants.get(slug);
    if (!names.includes(name)) names.push(name);
  }

  // One card per thread, and what each card says about it, are decided in lib/homeCards.js.
  const cards = pickCards(reviews, { businesses, limit });
  const items = cards.map((card) => card.review);

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
        const { business, replies } = cards[index];
        const likes = review.upvotes || 0;
        const time = formatTimeAgo(review.created_at);
        const stack = (participants.get(slugOf(review)) || []).slice(0, 3);

        return (
          <article className={`disc-card bento-card ${delayClass(index)}`} key={review.id}>
            <div className="disc-top">
              <div className="disc-cat" style={{ color: tone }}>
                <span className="tcard-glyph" style={{ background: tone }} aria-hidden />
                {catLabel(review.category)}
                {business ? <span className="topic-biz-chip">Business</span> : null}
              </div>
              {stack.length > 0 ? (
                <div className="disc-avatars" aria-hidden>
                  {stack.map((name, i) => (
                    <span
                      className={`disc-av ${AV_CLASSES[i % AV_CLASSES.length]}`}
                      key={name}
                      title={name}
                    >
                      {initials(name).slice(0, 1)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <h3 className="disc-title">
              <a className="disc-link" href={`/discussions/${slugOf(review)}`}>
                {business ? business.title : review.title || review.topic}
              </a>
            </h3>
            {/* The quote shows what someone SAID about the topic, so it has to
                differ from the heading. On a question row they are the same
                text, and printing it twice reads as a stutter — but a blank
                space says nothing either. A prompt does something: an
                unanswered question is a small, specific thing a passing reader
                could actually do. */}
            {review.kind === "question" ? (
              <p className="disc-quote disc-quote-empty">
                This question is yet to be answered, be the first one.
              </p>
            ) : review.summary ? (
              <p className="disc-quote">&ldquo;{review.summary}&rdquo;</p>
            ) : null}

            <div className="disc-divider" />

            <div className="disc-foot">
              {replies === null ? null : <span className="disc-replies">{replies} {replies === 1 ? "reply" : "replies"}</span>}
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
