// Shared rules for chat conversations ("topics"), so the server that stores a
// title and the sidebar that renders one never disagree.

export const TOPIC_TITLE_MAX = 80;

// How many conversations make up one page of the sidebar's history list.
//
// Shared because the cursor depends on it: the chat page renders the first
// page, /api/chat/history serves every page after it, and "a short page means
// there is no more" is only true if both use the same number.
export const HISTORY_PAGE_SIZE = 40;

// A conversation is named after the question that started it: whitespace
// collapsed, cut to something that fits the sidebar rail.
export function topicTitle(text) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  if (clean.length <= TOPIC_TITLE_MAX) return clean;
  return `${clean.slice(0, TOPIC_TITLE_MAX - 1).trimEnd()}…`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Union by id, newest activity first.
//
// The sidebar's list is assembled from three sources — the page's first slice,
// each page the infinite scroll pulls in, and whatever a search surfaces — and
// they overlap. Folding them into one list keeps rename and delete operating
// on a single array instead of several that would have to stay in sync.
//
// Incoming fields win on a collision, so a row refetched with a newer
// last_message_at moves up rather than keeping its stale position.
export function mergeTopics(current, incoming) {
  const byId = new Map(current.map((topic) => [topic.id, topic]));
  for (const row of incoming) {
    if (!row?.id) continue;
    byId.set(row.id, { ...byId.get(row.id), ...row });
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)
  );
}

// Conversations are listed newest-active first; the sidebar splits that one
// ordered list into the usual date buckets so a long history stays scannable.
// `now` is injectable so the boundaries can be tested without waiting for
// midnight.
export function groupByDate(items, now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const buckets = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] }
  ];

  for (const item of items) {
    const at = new Date(item.last_message_at || 0).getTime();
    if (!at || Number.isNaN(at)) buckets[3].items.push(item);
    else if (at >= startOfToday) buckets[0].items.push(item);
    else if (at >= startOfToday - DAY_MS) buckets[1].items.push(item);
    else if (at >= startOfToday - 7 * DAY_MS) buckets[2].items.push(item);
    else buckets[3].items.push(item);
  }

  return buckets.filter((bucket) => bucket.items.length);
}
