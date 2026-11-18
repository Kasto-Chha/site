// The replies queue (patch 14j): reviews on a business's Google profile that need an answer, and our draft of each reply, kept by hand
// until the Google connection exists. Pure rules first, then the database calls.

export const STATUSES = ["new", "asking", "drafted", "waiting", "approved", "posted"];
export const STATUS_LABELS = { new: "New review", asking: "Asking the owner", drafted: "Drafted", waiting: "Waiting for owner", approved: "Approved", posted: "Posted" };
export const REVIEWER_MAX = 80;
export const REVIEW_MAX = 1500;
export const DRAFT_MAX = 4000; // under Google's own limit for a reply
export const QUESTION_MAX = 500;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value) => (typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "");

export function validDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// A new reply or an edit. partial: only the fields present are checked. Returns { values } or { error }.
export function cleanReply(input, { partial = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "The reply was not understood." };
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  const values = {};
  if (!partial || has("reviewer")) {
    const reviewer = clean(input.reviewer);
    if (!reviewer) return { error: "Type the reviewer's name as Google shows it." };
    if (reviewer.length > REVIEWER_MAX) return { error: `The name can be at most ${REVIEWER_MAX} characters.` };
    values.reviewer = reviewer;
  }
  if (has("stars")) {
    const v = input.stars;
    if (v === null || v === "") values.stars = null;
    else {
      const n = /^[1-5]$/.test(String(v).trim()) ? Number(String(v).trim()) : NaN;
      if (!Number.isInteger(n)) return { error: "The stars must be 1 to 5." };
      values.stars = n;
    }
  }
  if (has("review")) {
    const review = clean(input.review);
    if (review.length > REVIEW_MAX) return { error: `The review can be at most ${REVIEW_MAX} characters.` };
    values.review = review;
  }
  if (has("draft")) {
    const draft = clean(input.draft);
    if (draft.length > DRAFT_MAX) return { error: `The reply can be at most ${DRAFT_MAX} characters.` };
    values.draft = draft;
  }
  if (has("team_question")) {
    const question = clean(input.team_question);
    if (question.length > QUESTION_MAX) return { error: `The question can be at most ${QUESTION_MAX} characters.` };
    values.team_question = question;
  }
  if (has("status")) {
    if (!STATUSES.includes(input.status)) return { error: "Choose a status from the list." };
    values.status = input.status;
  }
  if (has("review_on")) {
    const v = input.review_on;
    if (v === null || v === "") values.review_on = null;
    else if (validDate(v)) values.review_on = v;
    else return { error: "The review day is not a real date." };
  }
  if (partial && Object.keys(values).length === 0) return { error: "Nothing to change." };
  return { values };
}

// A reply that goes to the owner, is approved or is posted must have words.
export const needsWords = (status) => status === "waiting" || status === "approved" || status === "posted";

export function checkFinal(row) {
  if (needsWords(row.status) && !clean(row.draft)) return `Write the reply before it is "${STATUS_LABELS[row.status]}".`;
  if (row.status === "asking" && !clean(row.team_question)) return "Type the question for the owner first.";
  return null;
}

// Not yet posted, oldest review first (undated last); posted ones at the end, newest first.
export function sortReplies(replies) {
  const open = replies.filter((r) => r.status !== "posted").sort((a, b) => (a.review_on || "9999-12-31").localeCompare(b.review_on || "9999-12-31") || String(a.created_at).localeCompare(String(b.created_at)));
  const done = replies.filter((r) => r.status === "posted").sort((a, b) => String(b.posted_on || "").localeCompare(String(a.posted_on || "")));
  return [...open, ...done];
}

// ---------- the database ----------

const COLUMNS = "id, merchant_id, reviewer, stars, review, draft, status, review_on, posted_on, owner_note, team_question, owner_answer, owner_answered_at, created_by, created_at, updated_at";
const fail = (message, error) => Object.assign(new Error(message), { code: error?.code });

export async function listReplies(supabase, merchantId) {
  const { data, error } = await supabase.from("sync_replies").select(COLUMNS).eq("merchant_id", merchantId).limit(500);
  if (error) throw fail("The replies could not be read.", error);
  return sortReplies(data || []);
}

export async function getReply(supabase, merchantId, id) {
  const { data, error } = await supabase.from("sync_replies").select(COLUMNS).eq("merchant_id", merchantId).eq("id", id).maybeSingle();
  if (error) throw fail("The reply could not be read.", error);
  return data || null;
}

export async function createReply(supabase, merchantId, values, userId, now) {
  const row = { id: globalThis.crypto.randomUUID(), status: "new", stars: null, review: "", draft: "", review_on: null, posted_on: null, ...values, merchant_id: merchantId, created_by: userId, updated_at: now };
  const { data, error } = await supabase.from("sync_replies").insert(row).select(COLUMNS);
  if (error) throw fail("The reply could not be saved.", error);
  return Array.isArray(data) ? data[0] : data;
}

export async function updateReply(supabase, merchantId, id, values, now) {
  const { data, error } = await supabase.from("sync_replies").update({ ...values, updated_at: now }).eq("merchant_id", merchantId).eq("id", id).select(COLUMNS);
  if (error) throw fail("The reply could not be saved.", error);
  return (Array.isArray(data) ? data[0] : data) || null;
}

export async function deleteReply(supabase, merchantId, id) {
  const { data, error } = await supabase.from("sync_replies").delete().eq("merchant_id", merchantId).eq("id", id).select("id");
  if (error) throw fail("The reply could not be removed.", error);
  return Array.isArray(data) && data.length > 0;
}
