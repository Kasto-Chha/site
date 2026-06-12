import slugify from "slugify";

// Normalises a free-text topic into a stable slug so that experiences about the
// same subject collapse into one topic thread, regardless of casing, spacing or
// punctuation. e.g. "iPhone 15 Pro", "iphone 15  pro!" -> "iphone-15-pro".
export function topicSlug(value) {
  const text = (value || "").toString().trim();
  if (!text) return "";
  return slugify(text, {
    lower: true,
    strict: true,
    trim: true
  });
}
