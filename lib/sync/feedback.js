import { relativeDay } from "./overview";

// Private notes: what a customer sends to a business from the hub, which nobody but the KastoChha
// team (and, through them, the business) ever sees. Never posted, never public. Server-only apart
// from the pure helpers, which import nothing that needs a secret.

export const NOTE_MAX = 2000;
export const CONTACT_MAX = 120;
// A business can receive at most this many notes in a day. Cheap protection that does not depend on any
// outside service: a flood stops here even if the per-visitor limit is off.
export const DAILY_CAP_PER_BUSINESS = 100;
export const FEEDBACK_STATUSES = ["new", "in_digest", "resolved"];
export const INBOX_FILTERS = ["all", "urgent", "new", "in_digest", "resolved"];
export const INBOX_LIMIT = 200;

export const DIGEST_REMINDER = "Reminder: these notes are private. Customers' public posts are never removed on request, and no rewards for reviews.";

// A note keeps its line breaks (people write more than a line) but loses everything that is not text: control
// characters, trailing spaces, runs of blank lines. Not shortened: a note over the limit is refused, never cut.
export function cleanNote(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// How to reach the person, if they chose to say: one line, any form (a phone number, an email, "ask for Sita").
// Not checked for format: it is only ever read by a person.
export function cleanContact(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
}

// Words that make a note urgent: food and hygiene, safety, and how staff behaved. A flag for the team, nothing
// more: a person always reads a note before anything is forwarded, and a note without these words can be
// just as serious. Whole words only, so "great" is not "rat" and "chair" is not "hair". Plain "staff" is
// deliberately not here: "lovely staff" would be flagged as an emergency.
const URGENT_ENGLISH = [
  "hygiene", "hygienic", "unhygienic", "dirty", "filth", "filthy", "unclean", "cockroach", "cockroaches", "roach", "roaches",
  "rat", "rats", "mice", "insect", "insects", "worm", "worms", "rotten", "expired", "mould", "mold", "moldy", "mouldy",
  "poison", "poisoned", "poisoning", "vomit", "vomiting", "vomited", "sick", "diarrhea", "diarrhoea", "allergy", "allergic",
  "unsafe", "safety", "fire", "harass", "harassed", "harassment", "assault", "assaulted", "abuse", "abused", "abusive",
  "threat", "threatened", "theft", "stole", "stolen", "steal", "rude", "misbehaved", "misbehaviour", "misbehavior",
  "smelly", "stink", "stinks", "stinking", "stank"
];
// Devanagari does not have word boundaries that a regular expression understands, so these are matched as text.
const URGENT_DEVANAGARI = ["फोहोर", "सरसफाइ", "असुरक्षित", "चोरी"];
// "not clean", "wasn't clean", "never very hygienic": a complaint about cleanliness, which has no flagged word in it.
// A mouse is a rodent here, not a computer mouse: only when it is one that was seen or found.
const URGENT_PHRASES = [/\b(saw|seen|found|spotted|a|the)\s+mouse\b(?!\s+(pad|mat|click|button|cursor))/i, /\b(not|wasn't|isn't|weren't|aren't|never|hardly)\s+(very\s+|properly\s+|at all\s+|that\s+|really\s+)?(clean|hygienic)\b/i, /\bhair (in|on) (my|the|our) (food|soup|plate|drink|coffee|tea|noodles|momo)\b/i, /\bfood poison/i, /\bgas leak/i];
const URGENT_RE = new RegExp(`\\b(${URGENT_ENGLISH.join("|")})\\b`, "i");

export function isUrgent(message) {
  const text = typeof message === "string" ? message : "";
  return URGENT_RE.test(text) || URGENT_PHRASES.some((re) => re.test(text)) || URGENT_DEVANAGARI.some((w) => text.includes(w));
}

// Which notes a tab of the inbox shows (the same rule the database query uses, so a page and its tests agree).
export function matchesFilter(filter, note) {
  if (filter === "urgent") return Boolean(note.is_urgent) && note.status !== "resolved";
  if (filter === "new" || filter === "in_digest" || filter === "resolved") return note.status === filter;
  return true;
}

export function parseFilter(value) {
  return INBOX_FILTERS.includes(value) ? value : "all";
}

// "12 min ago", "5 h ago", "yesterday", "3 days ago", or a date for anything older than a month.
export function noteAge(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const minutes = Math.max(0, Math.round((now - t) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24 && relativeDay(iso, now) === "today") return `${hours} h ago`;
  const day = relativeDay(iso, now);
  return day === "yesterday" ? "Yesterday" : day === "today" ? `${hours} h ago` : day;
}

// The message a team member copies to send a business its notes, as in the design: numbered, urgent first, then
// oldest first. Plain text, for WhatsApp. null when there is nothing to send.
export function buildDigest({ businessName, notes }) {
  if (!notes || notes.length === 0) return null;
  const ordered = [...notes].sort((a, b) => (b.is_urgent ? 1 : 0) - (a.is_urgent ? 1 : 0) || Date.parse(a.created_at) - Date.parse(b.created_at));
  const lines = [`Private notes for ${businessName}`, ""];
  ordered.forEach((note, i) => lines.push(`${i + 1}. ${note.message.replace(/\s*\n+\s*/g, " ")}${note.is_urgent ? " (Urgent)" : ""}`));
  lines.push("", DIGEST_REMINDER);
  return lines.join("\n");
}

// One note, to forward on its own (an urgent one cannot wait for the digest).
export function forwardText({ businessName, note, now = Date.now() }) {
  return [`Private note for ${businessName}${note.is_urgent ? " (Urgent)" : ""}, ${noteAge(note.created_at, now)}:`, "", note.message, "", DIGEST_REMINDER].join("\n");
}

// ---------- the database ----------

export async function createFeedback(supabase, { merchantId, message, contact }) {
  const { data, error } = await supabase
    .from("sync_feedback")
    .insert({ merchant_id: merchantId, message, contact: contact || null, is_urgent: isUrgent(message) })
    .select("id")
    .single();
  // Only the error's code travels on: a database's message can quote the row it refused, which is the note.
  if (error) throw Object.assign(new Error("The note could not be saved."), { code: error.code });
  return data.id;
}

// Notes a business has had in the last day, for the daily cap.
export async function notesInLastDay(supabase, merchantId, now = Date.now()) {
  const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase.from("sync_feedback").select("id", { count: "exact", head: true }).eq("merchant_id", merchantId).gte("created_at", since);
  if (error) throw new Error(error.message);
  return count || 0;
}

const head = (supabase) => supabase.from("sync_feedback").select("id", { count: "exact", head: true });

// What is waiting: new notes, and how many are urgent. Exact counts, not a count of a page of rows.
export async function countNewFeedback(supabase) {
  const [all, urgent] = await Promise.all([head(supabase).eq("status", "new"), head(supabase).eq("status", "new").eq("is_urgent", true)]);
  if (all.error) throw new Error(all.error.message);
  if (urgent.error) throw new Error(urgent.error.message);
  return { total: all.count || 0, urgent: urgent.count || 0 };
}

// The tabs of the inbox, each with its count.
export async function feedbackCounts(supabase) {
  const [all, urgent, fresh, digest, done] = await Promise.all([
    head(supabase),
    head(supabase).eq("is_urgent", true).in("status", ["new", "in_digest"]),
    head(supabase).eq("status", "new"),
    head(supabase).eq("status", "in_digest"),
    head(supabase).eq("status", "resolved")
  ]);
  for (const r of [all, urgent, fresh, digest, done]) if (r.error) throw new Error(r.error.message);
  return { all: all.count || 0, urgent: urgent.count || 0, new: fresh.count || 0, in_digest: digest.count || 0, resolved: done.count || 0 };
}

// Notes for the inbox, newest first, the urgent ones that are still open before the rest, each with its business.
export async function listFeedback(supabase, { filter = "all", limit = INBOX_LIMIT } = {}) {
  const chosen = INBOX_FILTERS.includes(filter) ? filter : "all";
  let query = supabase.from("sync_feedback").select("id, merchant_id, message, contact, is_urgent, status, created_at, handled_at").order("created_at", { ascending: false }).limit(limit);
  if (chosen === "urgent") query = query.eq("is_urgent", true).in("status", ["new", "in_digest"]);
  else if (chosen !== "all") query = query.eq("status", chosen);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data || [];

  const ids = [...new Set(rows.map((r) => r.merchant_id))];
  const names = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const part = await supabase.from("sync_merchants").select("id, slug, business_name, area, status").in("id", ids.slice(i, i + 100));
    if (part.error) throw new Error(part.error.message);
    for (const m of part.data || []) names.set(m.id, m);
  }
  const notes = rows.map((r) => ({ ...r, business: names.get(r.merchant_id) || null }));
  const open = (n) => n.is_urgent && n.status !== "resolved";
  return notes.map((n, i) => ({ n, i })).sort((a, b) => Number(open(b.n)) - Number(open(a.n)) || a.i - b.i).map(({ n }) => n);
}
