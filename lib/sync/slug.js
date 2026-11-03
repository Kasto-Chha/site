import { topicSlug } from "../slug";

// Slugs for KastoChha Sync. A thread on KastoChha is the posts that share a
// topic_slug, and topic_slug is made from the post's title by lib/slug.js, so the
// thread slug for a new business is made with that same function from the same
// "Name, Area" title. A customer who posts under that title lands in the same
// thread, which is what keeps one café's posts together.

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Lowercase, trimmed. URLs arrive in any case; slugs are stored in lowercase.
export function normalizeSlug(value) {
  return (value ?? "").toString().trim().toLowerCase();
}

export function isValidSlug(value, max = 80) {
  const slug = normalizeSlug(value);
  return slug.length > 0 && slug.length <= max && SLUG_PATTERN.test(slug);
}

// "Himal Brew House, Jhamsikhel": the title shown for a business thread.
export function merchantTitle({ business_name, area } = {}) {
  const name = (business_name ?? "").toString().trim();
  const place = (area ?? "").toString().trim();
  if (!name) return "";
  return place ? `${name}, ${place}` : name;
}

// The thread slug for a business being tagged for the first time. When the café
// already has a thread, the admin links that thread's existing slug instead, and this
// is not used.
export function threadSlugFor({ name, area }) {
  return topicSlug(merchantTitle({ business_name: name, area }));
}
