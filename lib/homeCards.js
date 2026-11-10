import { topicSlug } from "./slug";

const slugOf = (review) => review.topic_slug || topicSlug(review.topic || review.title) || "general";

// Which discussions the home page shows as cards, and what each card says about its thread. `reviews` is the pool of
// recent posts, newest first; `businesses` maps a thread's address to the active business behind it (empty for an
// ordinary thread).
//
// - One card per thread, represented by its newest post.
// - A business's card is represented by its newest EXPERIENCE. A question must not stand for the thread: it would read
//   "This question is yet to be answered" over a business that has reviews. A business with nothing but questions has no
//   card, since there is nothing to read yet.
// - Replies on a business's card do not include its questions: eight experiences and two questions is seven replies.
export function pickCards(reviews, { businesses = {}, limit = 6 } = {}) {
  const rows = Array.isArray(reviews) ? reviews : [];
  const size = new Map();
  const questions = new Map();
  for (const review of rows) {
    const slug = slugOf(review);
    size.set(slug, (size.get(slug) || 0) + 1);
    if (review.kind === "question") questions.set(slug, (questions.get(slug) || 0) + 1);
  }
  const seen = new Set();
  const cards = [];
  for (const review of rows) {
    const slug = slugOf(review);
    const business = businesses[slug] || null;
    if (business && review.kind === "question") continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const others = (size.get(slug) || 1) - (business ? questions.get(slug) || 0 : 0) - 1;
    cards.push({ review, business, slug, replies: Math.max(others, 0) });
    if (cards.length >= limit) break;
  }
  return cards;
}
