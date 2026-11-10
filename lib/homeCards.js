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
// - A business's card shows no reply count at all (see below); an ordinary thread's card counts the other posts.
export function pickCards(reviews, { businesses = {}, limit = 6 } = {}) {
  const rows = Array.isArray(reviews) ? reviews : [];
  const size = new Map();
  for (const review of rows) {
    const slug = slugOf(review);
    size.set(slug, (size.get(slug) || 0) + 1);
  }
  const seen = new Set();
  const cards = [];
  for (const review of rows) {
    const slug = slugOf(review);
    const business = businesses[slug] || null;
    if (business && review.kind === "question") continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const others = (size.get(slug) || 1) - 1;
    // A business's card has no reply count: its experiences are separate customers, not replies to one another.
    cards.push({ review, business, slug, replies: business ? null : Math.max(others, 0) });
    if (cards.length >= limit) break;
  }
  return cards;
}
