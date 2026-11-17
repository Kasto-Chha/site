// The report's settings (patch 14e): the price and the ways to reach us that every report shows. Kept in the database, one row,
// changed from the Report settings page. Pure rules first, then the two database calls. Server only for the database part.

export const SETTING_LIMITS = { price: 120, phone: 40, whatsapp: 40, booking: 300 };
export const SETTING_LABELS = { price: "Price after the 90 days", phone: "Phone", whatsapp: "WhatsApp", booking: "Booking link (optional)" };

const line = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1);

// Returns the https address, "" when empty, or null when it is not a plain https link.
function httpsLink(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length > SETTING_LIMITS.booking) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

// What came from the form -> { values } (database columns) or { error }. A blank is allowed and means "not set".
export function cleanSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "The settings were not understood." };
  const price = line(input.price, SETTING_LIMITS.price);
  if (price.length > SETTING_LIMITS.price) return { error: `The price can be at most ${SETTING_LIMITS.price} characters.` };
  const numbers = {};
  for (const key of ["phone", "whatsapp"]) {
    const text = line(input[key], SETTING_LIMITS[key]);
    if (text.length > SETTING_LIMITS[key] || !/^[0-9+()\- ]*$/.test(text)) return { error: `${SETTING_LABELS[key]} can only have numbers, spaces, + ( ) and -, up to ${SETTING_LIMITS[key]} characters.` };
    numbers[key] = text;
  }
  const booking = httpsLink(input.booking);
  if (booking === null) return { error: "The booking link must be an https address, for example https://cal.example.com/kastochha." };
  return { values: { price: price || null, phone: numbers.phone || null, whatsapp: numbers.whatsapp || null, booking_link: booking || null } };
}

// The database row (or nothing) -> the words the report uses. Price, phone and WhatsApp not set show a bracketed placeholder, so
// they cannot be missed; the booking link is optional and the report simply leaves its line out.
export const PLACEHOLDERS = { price: "[PRICE]", phone: "[PHONE]", whatsapp: "[WHATSAPP]" };
export function contactsFrom(row) {
  const r = row && typeof row === "object" ? row : {};
  return { price: r.price || PLACEHOLDERS.price, phone: r.phone || PLACEHOLDERS.phone, whatsapp: r.whatsapp || PLACEHOLDERS.whatsapp, booking: httpsLink(r.booking_link) || "" };
}

// The placeholders still showing.
export const unfilled = (contacts) => Object.entries(PLACEHOLDERS).filter(([key, text]) => contacts?.[key] === text).map(([, text]) => text);

// Contacts saved with a report that was sent: only ever a full, checked set.
export function cleanFrozen(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const contacts = { price: line(value.price, 120), phone: line(value.phone, 40), whatsapp: line(value.whatsapp, 40), booking: httpsLink(value.booking) || "" };
  return contacts.price && contacts.phone && contacts.whatsapp && unfilled(contacts).length === 0 ? contacts : null;
}

// What a report shows: the copy taken when it was sent, else today's settings.
export const contactsForProspect = (prospect, settingsRow) => cleanFrozen(prospect?.report_contacts) || contactsFrom(settingsRow);

// ---------- the database ----------

const COLUMNS = "id, price, phone, whatsapp, booking_link, updated_at";

// The settings row, or null when none was saved yet. A problem reading is never fatal to a report: it shows the placeholders.
export async function readSettings(supabase) {
  try {
    const { data, error } = await supabase.from("sync_report_settings").select(COLUMNS).eq("id", "default").maybeSingle();
    return error ? null : data || null;
  } catch {
    return null;
  }
}

export async function writeSettings(supabase, values, userId) {
  const stamp = { updated_at: new Date().toISOString(), updated_by: userId };
  const existing = await supabase.from("sync_report_settings").select("id").eq("id", "default").maybeSingle();
  if (existing.error) throw Object.assign(new Error("The settings could not be read."), { code: existing.error.code });
  const result = existing.data
    ? await supabase.from("sync_report_settings").update({ ...values, ...stamp }).eq("id", "default").select(COLUMNS)
    : await supabase.from("sync_report_settings").insert({ id: "default", ...values, ...stamp }).select(COLUMNS);
  if (result.error) throw Object.assign(new Error("The settings could not be saved."), { code: result.error.code });
  return Array.isArray(result.data) ? result.data[0] : result.data;
}
