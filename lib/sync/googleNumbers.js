// The Google numbers typed in by hand (patch 14g): calls, directions, profile views, rating and reviews for one month. Pure rules
// first, then the database calls. Gregorian months, because that is what the Business Profile screen shows.

export const NOTE_MAX = 300;
export const EARLIEST_YEAR = 2020;
export const COUNT_FIELDS = [
  { key: "calls", column: "calls", label: "Calls", max: 1_000_000 },
  { key: "directions", column: "directions", label: "Directions requests", max: 1_000_000 },
  { key: "views", column: "profile_views", label: "Profile views", max: 100_000_000 },
  { key: "reviews", column: "reviews", label: "Total reviews", max: 1_000_000 }
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-10" or "2026-10-01" -> "2026-10-01"; anything else null.
export function parseMonth(value) {
  const m = /^(\d{4})-(\d{2})(?:-01)?$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  return year >= EARLIEST_YEAR && month >= 1 && month <= 12 ? `${m[1]}-${m[2]}-01` : null;
}

export const monthLabel = (iso) => {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso ?? ""));
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso ?? "");
};

const monthOf = (todayIso) => String(todayIso).slice(0, 7);

// The months that can be typed: this month back to the earliest, newest first (at most 36).
export function monthOptions(todayIso, count = 36) {
  const out = [];
  let year = Number(String(todayIso).slice(0, 4));
  let month = Number(String(todayIso).slice(5, 7));
  while (out.length < count && year >= EARLIEST_YEAR) {
    out.push({ value: `${year}-${String(month).padStart(2, "0")}`, label: `${MONTHS[month - 1]} ${year}` });
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  return out;
}

// The month before today's: what the Business Profile screen has finished showing.
export const lastMonth = (todayIso) => monthOptions(todayIso, 2)[1]?.value || monthOptions(todayIso, 1)[0].value;

function count(value, max, label) {
  if (value === undefined || value === null || String(value).trim() === "") return { value: null };
  const text = String(value).trim().replace(/,/g, "");
  if (!/^\d{1,9}$/.test(text)) return { error: `${label} must be a whole number.` };
  const n = Number(text);
  if (n > max) return { error: `${label} can be at most ${max.toLocaleString("en-US")}.` };
  return { value: n };
}

// What came from the form -> { values } (database columns) or { error }. At least one figure is needed; a blank one is "not known".
export function cleanNumbers(input, todayIso) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "The numbers were not understood." };
  const month = parseMonth(input.month);
  if (!month) return { error: "Choose the month." };
  if (month.slice(0, 7) > monthOf(todayIso)) return { error: "That month has not happened yet." };
  const values = { month };
  let any = false;
  for (const field of COUNT_FIELDS) {
    const result = count(input[field.key], field.max, field.label);
    if (result.error) return { error: result.error };
    values[field.column] = result.value;
    if (result.value !== null) any = true;
  }
  const rating = input.rating;
  if (rating === undefined || rating === null || String(rating).trim() === "") values.rating = null;
  else {
    const text = String(rating).trim();
    const n = /^\d(\.\d)?$/.test(text) ? Number(text) : NaN;
    if (!Number.isFinite(n) || n < 0 || n > 5) return { error: "The rating must be from 0 to 5, with at most one decimal." };
    values.rating = n;
    any = true;
  }
  if (!any) return { error: "Type in at least one figure." };
  const note = String(input.note ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").trim();
  if (note.length > NOTE_MAX) return { error: `The note can be at most ${NOTE_MAX} characters.` };
  values.note = note || null;
  return { values };
}

// ---------- the database ----------

const COLUMNS = "merchant_id, month, calls, directions, profile_views, rating, reviews, note, entered_at";

export async function listNumbers(supabase, merchantId, limit = 36) {
  const { data, error } = await supabase.from("sync_google_numbers").select(COLUMNS).eq("merchant_id", merchantId).order("month", { ascending: false }).limit(limit);
  if (error) throw Object.assign(new Error("The numbers could not be read."), { code: error.code });
  return data || [];
}

// Typing a month again replaces it. -> { replaced }.
export async function saveNumbers(supabase, merchantId, values, userId) {
  const existing = await supabase.from("sync_google_numbers").select("month").eq("merchant_id", merchantId).eq("month", values.month).maybeSingle();
  if (existing.error) throw Object.assign(new Error("The numbers could not be read."), { code: existing.error.code });
  const stamp = { entered_by: userId, entered_at: new Date().toISOString() };
  const result = existing.data
    ? await supabase.from("sync_google_numbers").update({ ...values, ...stamp }).eq("merchant_id", merchantId).eq("month", values.month).select("month")
    : await supabase.from("sync_google_numbers").insert({ merchant_id: merchantId, ...values, ...stamp }).select("month");
  if (result.error) throw Object.assign(new Error("The numbers could not be saved."), { code: result.error.code });
  return { replaced: Boolean(existing.data) };
}

// -> true if a row was removed.
export async function removeNumbers(supabase, merchantId, month) {
  const { data, error } = await supabase.from("sync_google_numbers").delete().eq("merchant_id", merchantId).eq("month", month).select("month");
  if (error) throw Object.assign(new Error("The numbers could not be removed."), { code: error.code });
  return Array.isArray(data) && data.length > 0;
}
