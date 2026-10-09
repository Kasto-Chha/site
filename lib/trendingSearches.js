// The homepage's "Trending searches": which of the questions people opened the
// assistant with are worth showing, and in what order.
//
// A search from the hero box opens a conversation, so the newest conversations
// ARE the recent searches. Everything here is about turning that raw list into
// something that can sit on the front page: real (asked by more than one
// person, and typed rather than clicked), safe (nothing private, nothing an
// admin has hidden), and current (recent asks outweigh old ones).
//
// Pure functions over rows the caller has already fetched — no database and no
// secrets — so the rules can be tested directly and the admin form can share
// the limits.

import { UNTITLED_TOPIC } from "./chatTopics";

// How many searches the row shows.
export const TRENDING_SEARCH_LIMIT = 5;

// How many of the newest typed conversations are ranked. A sample rather than a
// time window so the list adapts to traffic on its own: it covers hours on a
// busy day and weeks on a quiet one, and never comes back empty just because
// nobody asked anything this week.
export const TRENDING_SEARCH_SAMPLE = 500;

// The longest opening question that still reads as a search. Past this it is a
// paragraph, and five of them would bury the hero they sit under.
export const TRENDING_SEARCH_MAX = 60;

// How many different people must have asked before a search is shown. One
// person's question is theirs; the second asker is what makes it a topic. It is
// also the main privacy guard — something only you typed stays off the
// homepage however harmless it looks to a filter.
export const TRENDING_MIN_ASKERS = 2;

// An ask counts for half as much every three days. Long enough that a quiet
// weekend doesn't empty the ranking, short enough that last month's question
// can't sit above this week's on volume it earned back then.
export const TRENDING_HALF_LIFE_MS = 72 * 60 * 60 * 1000;

// How long a computed list is served before it is worked out again (seconds),
// and the cache tag that drops it early — see getTrendingChatSearches.
export const TRENDING_SEARCH_TTL = 600;
export const TRENDING_SEARCH_TAG = "trending-searches";

// What an admin rule (trending_search_rules.action) does:
//   HIDE      any search containing the term never appears
//   FALLBACK  the term fills the row when too few real searches qualify
export const SEARCH_RULE = { HIDE: "hide", FALLBACK: "fallback" };

const collapse = (text) => (text || "").toString().replace(/\s+/g, " ").trim();

// Letters and digits only, lower-cased, single-spaced. Punctuation and case
// are how two people type the same thing differently, not part of the search.
// \p{M} keeps the vowel signs Devanagari is written with.
function plain(text) {
  return collapse(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();
}

// "<thing> kasto chha?" is how the site itself phrases a question, so the same
// search arrives with the suffix, without it, and with every spelling of it.
const KASTO_CHHA_TAIL =
  /(?:^| )(?:kasto|कस्तो)(?: (?:chha|chaa?|xa|6|ho|hola|छ|हो|होला))?(?: (?:ta|ni|hola|त|नि))?$/u;

// What two searches are compared by: "ABC Trek kasto chha?", "abc trek" and
// "ABC  Trek kasto xa" are one search. Deliberately no fuzzier than that —
// merging "iPhone" into "iPhone 17 Pro price" would be a guess, and a wrong
// guess puts words on the homepage nobody typed.
export function searchKey(text) {
  return plain(text).replace(KASTO_CHHA_TAIL, "").trim();
}

// Openers that are a greeting or a poke at the box rather than a search. They
// are exactly what many different people type, so without this "hi" would
// clear the asker threshold before any real topic did.
const SMALL_TALK = new Set(
  [
    "hi", "hii", "hiii", "hello", "helo", "hlo", "hey", "hy", "yo", "namaste", "namaskar",
    "नमस्ते", "नमस्कार", "good morning", "good afternoon", "good evening", "good night",
    "test", "testing", "ok", "okay", "thanks", "thank you", "dhanyabad", "bye",
    "k cha", "k chha", "k xa", "ke cha", "ke chha", "k cha khabar", "sanchai", "sanchai cha",
    "help", "who are you", "what can you do", "what is this", "timi ko hau", "tapai ko ho"
  ].map(plain)
);

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LINK = /(?:https?:\/\/|www\.)\S/i;
// Nine or more digits, however they are spaced: a mobile number (98XXXXXXXX), a
// landline with its area code, a +977 form, in Latin or Devanagari digits.
// Prices and model numbers are shorter, so they pass.
const PHONE = /(?:[\d०-९][\s().+-]{0,2}){9,}/;

// Whether an opening question may be shown to other people at all.
//
// The asker threshold already keeps one person's question off the page; this
// is for what several people could plausibly type and still shouldn't be
// repeated — someone's number, an address to visit — and for openers that
// aren't searches.
export function isPublicSearch(text) {
  const title = collapse(text);
  // A title ending in the ellipsis was cut by topicTitle: half a sentence to
  // read, and a link that would search for the half.
  if (!title || title === UNTITLED_TOPIC || title.endsWith("…")) return false;
  if (title.length > TRENDING_SEARCH_MAX) return false;
  if (EMAIL.test(title) || LINK.test(title) || PHONE.test(title)) return false;

  const key = searchKey(title);
  // Too short to mean anything, or all digits and symbols.
  if (key.length < 2 || !/\p{L}/u.test(key)) return false;
  return !SMALL_TALK.has(key) && !SMALL_TALK.has(plain(title));
}

function compileRules(rules) {
  const hidden = [];
  const fallback = [];

  for (const rule of rules || []) {
    const label = collapse(rule?.term);
    const phrase = plain(label);
    if (!phrase) continue;

    if (rule.action === SEARCH_RULE.HIDE) {
      // Padded so the match below is on whole words: hiding "ass" must not
      // hide "class".
      hidden.push(` ${phrase} `);
    } else if (rule.action === SEARCH_RULE.FALLBACK && label.length <= TRENDING_SEARCH_MAX) {
      fallback.push({ label, key: searchKey(label), rank: Number(rule.rank) || 0 });
    }
  }

  fallback.sort((a, b) => a.rank - b.rank);
  return { isHidden: (title) => hidden.some((phrase) => ` ${plain(title)} `.includes(phrase)), fallback };
}

// Who asked, for counting different people rather than conversations. One
// account repeating a question is one asker, so it cannot put itself on the
// homepage. A guest is told apart by guest_key (see guestAskerKey); a guest
// row from before that column existed has nothing to go on, so all of those
// together count as a single asker rather than each as their own — the
// cautious reading, given what the threshold is for.
function askerOf(row) {
  if (row.user_id) return `user:${row.user_id}`;
  return `guest:${row.guest_key || ""}`;
}

// The searches to show, best first.
//
//   rows   chat_topics, any order: { opening_query, title, user_id, guest_key,
//          source, created_at }. opening_query is the question as first asked;
//          title is the fallback for rows older than that column, and may have
//          been renamed since.
//   rules  trending_search_rules: { term, action, rank }
//
// Each search scores the sum of its askers' most recent asks, each one decayed
// by age, so three people this morning beat five people last month. A search
// below the asker threshold is not ranked at all — a high score cannot buy its
// way past that. Whatever the threshold leaves empty is filled from the
// admin's fallback terms, in their order.
export function rankTrendingSearches(
  rows,
  { rules = [], limit = TRENDING_SEARCH_LIMIT, minAskers = TRENDING_MIN_ASKERS, now = Date.now() } = {}
) {
  const { isHidden, fallback } = compileRules(rules);
  const groups = new Map();

  for (const row of rows || []) {
    // Opened by clicking something the site suggested, not by typing.
    if (!row || row.source) continue;

    const title = collapse(row.opening_query || row.title);
    if (!isPublicSearch(title) || isHidden(title)) continue;

    const key = searchKey(title);
    let group = groups.get(key);
    if (!group) {
      group = { key, askers: new Map(), spellings: new Map(), newest: 0 };
      groups.set(key, group);
    }

    // An unreadable timestamp is treated as very old rather than as now: it
    // still counts as an asker, it just carries no weight.
    const askedAt = Date.parse(row.created_at) || 0;
    const weight = askedAt ? 0.5 ** (Math.max(0, now - askedAt) / TRENDING_HALF_LIFE_MS) : 0;

    const asker = askerOf(row);
    group.askers.set(asker, Math.max(group.askers.get(asker) ?? 0, weight));
    group.newest = Math.max(group.newest, askedAt);

    const spelling = group.spellings.get(title) || { count: 0, newest: 0 };
    spelling.count += 1;
    spelling.newest = Math.max(spelling.newest, askedAt);
    group.spellings.set(title, spelling);
  }

  const ranked = Array.from(groups.values())
    .filter((group) => group.askers.size >= minAskers)
    .map((group) => {
      let score = 0;
      for (const weight of group.askers.values()) score += weight;

      // Shown the way most people typed it; between equals, the latest way.
      const [label] = Array.from(group.spellings.entries()).sort(
        ([, a], [, b]) => b.count - a.count || b.newest - a.newest
      )[0];

      return { key: group.key, label, score, newest: group.newest };
    })
    .sort((a, b) => b.score - a.score || b.newest - a.newest)
    .slice(0, limit);

  const shown = new Set(ranked.map((group) => group.key));
  const labels = ranked.map((group) => group.label);

  for (const term of fallback) {
    if (labels.length >= limit) break;
    if (shown.has(term.key)) continue;
    shown.add(term.key);
    labels.push(term.label);
  }

  return labels;
}
