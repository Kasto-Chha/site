// ---------------------------------------------------------------------------
// Matching what someone typed against what already exists.
//
// Used in two places that had the same problem for the same reason:
//
//   the answer engine   searching community experiences for a question
//   the share form      finding threads that already cover what you're about
//                       to write about
//
// Both previously did exact matching — the whole phrase against a title, or a
// slug against a slug — which fails on any natural phrasing. "Sikko calculator
// ko battery kasto chha?" found nothing while a review said exactly that.
//
// Extracted here so the two stay in step. Changing the stopword list in one
// place should change it in both.
// ---------------------------------------------------------------------------

// Words that say nothing about *what* is being asked. Nepali question
// scaffolding first — "BYD ko resale value kasto chha?" is about BYD and
// resale, not about "ko" or "chha" — then the English equivalents.
export const STOPWORDS = new Set([
  "ko", "ka", "ki", "le", "lai", "ma", "bata", "sanga", "ra", "tara", "pani",
  "chha", "cha", "chan", "chhan", "ho", "hola", "hunchha", "huncha", "bhaye",
  "bhane", "garda", "garne", "garnu", "kasto", "kati", "kina", "ke", "kun",
  "malai", "hamro", "timro", "yo", "tyo", "yesto", "tyesto", "ani", "vane",
  "the", "a", "an", "is", "are", "was", "of", "for", "to", "in", "on", "at",
  "and", "or", "but", "what", "how", "why", "which", "who", "any", "some",
  "good", "bad", "best", "worst", "about", "with", "from", "it", "its", "this",
  "that", "should", "would", "can", "do", "does", "did", "have", "has"
]);

// Text -> the words worth searching for.
//
// Strict allowlist rather than escaping: these tokens get interpolated into a
// PostgREST .or() filter, where a comma or bracket changes the meaning of the
// expression rather than just the value. Anything outside [a-z0-9] is dropped.
export function searchTokens(text, { max = 6, minLength = 3 } = {}) {
  return [
    ...new Set(
      String(text || "")
        .slice(0, 200)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= minLength && !STOPWORDS.has(word))
    )
  ].slice(0, max);
}

// Builds the OR filter for a PostgREST query across several text columns.
// Returns "" when there is nothing to search for, so callers can fall back.
export function ilikeAnyClause(tokens, columns) {
  if (!tokens.length || !columns.length) return "";
  return tokens
    .flatMap((token) => columns.map((column) => `${column}.ilike.%${token}%`))
    .join(",");
}

// How much of what someone typed a row actually covers.
//
// Headings count double: a word in the thread's own name is a stronger signal
// than the same word buried in a sentence. Matching on any single token is
// deliberately generous, and this is where that generosity is paid back.
export function relevanceScore(tokens, { heading = "", body = "" }) {
  const head = String(heading).toLowerCase();
  const text = String(body).toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (head.includes(token)) score += 2;
    else if (text.includes(token)) score += 1;
  }
  return score;
}
