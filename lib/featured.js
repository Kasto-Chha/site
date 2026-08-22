// Where a featured story points, in one place — the homepage grid and the
// /featured front page both used to decide this for themselves, and only one of
// them had a fallback, so a story saved without a link_url was a dead card on
// the homepage and a working link on /featured.
//
// A story either links somewhere the editor chose (link_url, which may be an
// internal route or an external article) or falls back to its own permalink,
// which is always readable because the permalink renders the story's own body.
export function storyHref(story) {
  if (!story) return "/featured";
  // Falls back to the id for rows written before the slug column existed, so a
  // half-migrated database still links somewhere rather than nowhere.
  return story.link_url || `/featured/${story.slug || story.id}`;
}

// True when the story has an article body worth opening the permalink for,
// rather than just a card's worth of title and description.
export function hasStoryBody(story) {
  return Boolean((story?.body || "").trim());
}

// Split a stored body into paragraphs. Editors type into a plain textarea, so
// a blank line is the only paragraph break available to them.
export function storyParagraphs(story) {
  return (story?.body || "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}
