// The posts plan (patch 14i): what a business will put on its Google profile, planned by hand until the Google connection exists.
// Pure rules first, then the database calls.

export const STATUSES = ["idea", "drafted", "waiting", "approved", "published"];
export const STATUS_LABELS = { idea: "Idea", drafted: "Drafted", waiting: "Waiting for owner", approved: "Approved", published: "Published" };
export const KINDS = ["update", "offer", "event"];
export const KIND_LABELS = { update: "Update", offer: "Offer", event: "Event" };
export const TITLE_MAX = 120;
export const BODY_MAX = 1500; // Google's own limit for a post
export const LINK_MAX = 300;

// Festival prompts: names only. Nepali festival dates follow the lunar calendar and move every year, so no date is guessed here.
export const FESTIVALS = ["Dashain", "Tihar", "Teej", "Holi", "Nepali New Year", "Buddha Jayanti", "Christmas", "Valentine's Day", "Mother's Day", "Chhath", "Lhosar", "Maha Shivaratri"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value) => (typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "");

export function validDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Only an https address, so a button never leads somewhere odd.
export function cleanLink(value) {
  const text = clean(value);
  if (!text) return { link: null };
  if (text.length > LINK_MAX) return { error: `The button link can be at most ${LINK_MAX} characters.` };
  let url;
  try { url = new URL(text); } catch { return { error: "The button link must be a full web address starting with https://." }; }
  if (url.protocol !== "https:") return { error: "The button link must be a full web address starting with https://." };
  return { link: url.toString() };
}

// A new post or an edit. partial: only the fields present are checked. Returns { values } or { error }.
export function cleanPost(input, { partial = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "The post was not understood." };
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  const values = {};
  if (!partial || has("title")) {
    const title = clean(input.title);
    if (!title) return { error: "Give the post a title." };
    if (title.length > TITLE_MAX) return { error: `The title can be at most ${TITLE_MAX} characters.` };
    values.title = title;
  }
  if (has("body")) {
    const body = clean(input.body);
    if (body.length > BODY_MAX) return { error: `The post can be at most ${BODY_MAX} characters, the limit on Google.` };
    values.body = body;
  }
  if (has("kind")) {
    if (!KINDS.includes(input.kind)) return { error: "Choose Update, Offer or Event." };
    values.kind = input.kind;
  }
  if (has("status")) {
    if (!STATUSES.includes(input.status)) return { error: "Choose a status from the list." };
    values.status = input.status;
  }
  if (has("planned_on")) {
    const v = input.planned_on;
    if (v === null || v === "") values.planned_on = null;
    else if (validDate(v)) values.planned_on = v;
    else return { error: "The planned day is not a real date." };
  }
  if (has("button_link")) {
    const r = cleanLink(input.button_link);
    if (r.error) return { error: r.error };
    values.button_link = r.link;
  }
  if (partial && Object.keys(values).length === 0) return { error: "Nothing to change." };
  return { values };
}

// A post that goes to the owner, is approved or is posted must have words in it.
export function needsWords(status) {
  return status === "waiting" || status === "approved" || status === "published";
}

// What the final row will be -> an error to show, or null.
export function checkFinal(row) {
  if (needsWords(row.status) && !clean(row.body)) return `Write the post before it is "${STATUS_LABELS[row.status]}".`;
  return null;
}

// Posts in plan order: the ones to do first (by planned day, undated last), published ones at the end, newest first.
export function sortPosts(posts) {
  const open = posts.filter((p) => p.status !== "published").sort((a, b) => (a.planned_on || "9999-12-31").localeCompare(b.planned_on || "9999-12-31") || String(a.created_at).localeCompare(String(b.created_at)));
  const done = posts.filter((p) => p.status === "published").sort((a, b) => String(b.published_on || "").localeCompare(String(a.published_on || "")));
  return [...open, ...done];
}

// ---------- the database ----------

const COLUMNS = "id, merchant_id, title, body, kind, status, planned_on, button_link, published_on, owner_note, created_by, created_at, updated_at";
const fail = (message, error) => Object.assign(new Error(message), { code: error?.code });

export async function listPosts(supabase, merchantId) {
  const { data, error } = await supabase.from("sync_posts").select(COLUMNS).eq("merchant_id", merchantId).limit(500);
  if (error) throw fail("The posts could not be read.", error);
  return sortPosts(data || []);
}

export async function getPost(supabase, merchantId, id) {
  const { data, error } = await supabase.from("sync_posts").select(COLUMNS).eq("merchant_id", merchantId).eq("id", id).maybeSingle();
  if (error) throw fail("The post could not be read.", error);
  return data || null;
}

export async function createPost(supabase, merchantId, values, userId, now) {
  const row = { id: globalThis.crypto.randomUUID(), kind: "update", status: "idea", body: "", planned_on: null, button_link: null, published_on: null, ...values, merchant_id: merchantId, created_by: userId, updated_at: now };
  const { data, error } = await supabase.from("sync_posts").insert(row).select(COLUMNS);
  if (error) throw fail("The post could not be saved.", error);
  return Array.isArray(data) ? data[0] : data;
}

export async function updatePost(supabase, merchantId, id, values, now) {
  const { data, error } = await supabase.from("sync_posts").update({ ...values, updated_at: now }).eq("merchant_id", merchantId).eq("id", id).select(COLUMNS);
  if (error) throw fail("The post could not be saved.", error);
  return (Array.isArray(data) ? data[0] : data) || null;
}

export async function deletePost(supabase, merchantId, id) {
  const { data, error } = await supabase.from("sync_posts").delete().eq("merchant_id", merchantId).eq("id", id).select("id");
  if (error) throw fail("The post could not be removed.", error);
  return Array.isArray(data) && data.length > 0;
}
