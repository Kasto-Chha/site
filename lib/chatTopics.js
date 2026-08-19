// Shared rules for chat conversations ("topics"), so the server that stores a
// title and the sidebar that renders one never disagree.

export const TOPIC_TITLE_MAX = 80;

// A conversation is named after the question that started it: whitespace
// collapsed, cut to something that fits the sidebar rail.
export function topicTitle(text) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  if (clean.length <= TOPIC_TITLE_MAX) return clean;
  return `${clean.slice(0, TOPIC_TITLE_MAX - 1).trimEnd()}…`;
}
