// Shared rules for chat conversations ("topics"), so the server that stores a
// title and the sidebar that renders one never disagree.

export const TOPIC_TITLE_MAX = 80;

// How many conversations make up one page of the sidebar's history list.
//
// Shared because the cursor depends on it: the chat page renders the first
// page, /api/chat/history serves every page after it, and "a short page means
// there is no more" is only true if both use the same number.
export const HISTORY_PAGE_SIZE = 40;

// How much of a conversation goes to the model with each question: the last
// CONTEXT_TURNS turns, each cut to TURN_MAX_CHARS. The server enforces both, and
// the client sends no more than that — the rest would only be thrown away, and
// the chat endpoint caps its request body (lib/requestBody.js), so a long
// conversation sent whole would eventually be refused.
export const CONTEXT_TURNS = 20;
export const TURN_MAX_CHARS = 4000;

// What a conversation is called when it opened with nothing to name it after.
const UNTITLED = "New chat";

// A conversation is named after the question that started it: whitespace
// collapsed, cut to something that fits the sidebar rail.
export function topicTitle(text) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return UNTITLED;
  if (clean.length <= TOPIC_TITLE_MAX) return clean;
  return `${clean.slice(0, TOPIC_TITLE_MAX - 1).trimEnd()}…`;
}

// How many of the newest conversations the homepage's "Trending searches" are
// ranked from. A sample rather than a time window so the list adapts to
// traffic on its own: it covers hours on a busy day and weeks on a quiet one,
// and never comes back empty just because nobody asked anything this week.
export const TRENDING_SEARCH_SAMPLE = 300;

// The longest opening question that still reads as a search. Past this it is a
// paragraph, and five of them would bury the hero they sit under.
export const TRENDING_SEARCH_MAX = 60;

// What two searches are compared by. Case, spacing and trailing punctuation
// don't make "ABC Trek?" a different search from "abc trek".
function searchKey(title) {
  return title.toLowerCase().replace(/[\s?!.,।]+$/u, "").trim();
}

// The most-asked opening questions among `rows` (chat_topics, newest first).
//
// Ranked by how many different people asked, not how many times it was asked:
// one account sending the same question ten times is one asker, so it cannot
// put itself on the homepage. Guests have no id to tell apart, so each guest
// conversation counts as its own asker — the trial cap and per-IP rate limit
// are what bound those. Ties go to whichever was asked most recently.
export function rankTrendingSearches(rows, limit = 5) {
  const groups = new Map();

  for (const row of rows || []) {
    const title = (row?.title || "").replace(/\s+/g, " ").trim();
    // A title ending in the ellipsis was cut by topicTitle: half a sentence to
    // read, and a link that would search for the half.
    if (!title || title === UNTITLED || title.endsWith("…")) continue;
    if (title.length > TRENDING_SEARCH_MAX) continue;

    const key = searchKey(title);
    if (!key) continue;

    let group = groups.get(key);
    if (!group) {
      // First seen is newest, so the label is the latest way it was typed and
      // insertion order doubles as the recency tie-break.
      group = { label: title, users: new Set(), guests: 0, order: groups.size };
      groups.set(key, group);
    }
    if (row.user_id) group.users.add(row.user_id);
    else group.guests += 1;
  }

  return Array.from(groups.values())
    .map((group) => ({ ...group, askers: group.users.size + group.guests }))
    .sort((a, b) => b.askers - a.askers || a.order - b.order)
    .slice(0, limit)
    .map((group) => group.label);
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
