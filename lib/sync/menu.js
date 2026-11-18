// The menu, rooms and rates, or services (patch 14l): what a business offers, typed in by hand and confirmed by the owner. Pure rules
// first, then the database calls. The words (Menu, Rooms and rates, Services) come from the business's family, in families.js.

export const STATUSES = ["draft", "waiting", "confirmed"];
export const STATUS_LABELS = { draft: "Draft", waiting: "Waiting for owner", confirmed: "Confirmed" };
export const SECTION_MAX = 60;
export const NAME_MAX = 100;
export const DESCRIPTION_MAX = 300;
export const UNIT_MAX = 40;
export const PRICE_MAX = 100_000_000;
export const ITEM_LIMIT = 300;

const clean = (value) => (typeof value === "string" ? value.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim() : "");
const line = (value) => clean(value).replace(/\s+/g, " ");

// A new item or an edit. partial: only the fields present are checked. Returns { values } or { error }.
export function cleanItem(input, { partial = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "The item was not understood." };
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  const values = {};
  if (!partial || has("name")) {
    const name = line(input.name);
    if (!name) return { error: "Give the item a name." };
    if (name.length > NAME_MAX) return { error: `The name can be at most ${NAME_MAX} characters.` };
    values.name = name;
  }
  if (has("section")) {
    const section = line(input.section);
    if (section.length > SECTION_MAX) return { error: `The section can be at most ${SECTION_MAX} characters.` };
    values.section = section;
  }
  if (has("description")) {
    const description = clean(input.description);
    if (description.length > DESCRIPTION_MAX) return { error: `The description can be at most ${DESCRIPTION_MAX} characters.` };
    values.description = description;
  }
  if (has("price")) {
    const v = input.price;
    if (v === null || v === undefined || String(v).trim() === "") values.price = null;
    else {
      const text = String(v).trim().replace(/,/g, "");
      const n = /^\d{1,9}$/.test(text) ? Number(text) : NaN;
      if (!Number.isInteger(n) || n < 0 || n > PRICE_MAX) return { error: "The price is a whole number of rupees, for example 350." };
      values.price = n;
    }
  }
  if (has("unit")) {
    const unit = line(input.unit);
    if (unit.length > UNIT_MAX) return { error: `The unit can be at most ${UNIT_MAX} characters.` };
    values.unit = unit;
  }
  if (has("status")) {
    if (!STATUSES.includes(input.status)) return { error: "Choose a status from the list." };
    values.status = input.status;
  }
  if (partial && Object.keys(values).length === 0) return { error: "Nothing to change." };
  return { values };
}

// Changing what an item says (its name, section, description, price or unit) takes back what the owner confirmed: it is a draft again.
export const CONTENT_FIELDS = ["name", "section", "description", "price", "unit"];
export const changesContent = (values, existing) => CONTENT_FIELDS.some((key) => key in values && values[key] !== existing[key]);

export function formatPrice(price, unit) {
  if (price === null || price === undefined) return "";
  return `Rs ${Number(price).toLocaleString("en-US")}${unit ? ` ${unit}` : ""}`;
}

export const sortItems = (items) => items.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.created_at).localeCompare(String(b.created_at)));

// Sections in the order they first appear, each with its items in order.
export function groupItems(items) {
  const groups = [];
  for (const item of sortItems(items)) {
    let group = groups.find((g) => g.section === (item.section || ""));
    if (!group) { group = { section: item.section || "", items: [] }; groups.push(group); }
    group.items.push(item);
  }
  return groups;
}

// The list as plain text to paste: only confirmed items unless told otherwise.
export function formatList(items, { onlyConfirmed = true } = {}) {
  const lines = [];
  for (const group of groupItems(items.filter((i) => !onlyConfirmed || i.status === "confirmed"))) {
    if (lines.length) lines.push("");
    if (group.section) lines.push(group.section.toUpperCase());
    for (const item of group.items) {
      const price = formatPrice(item.price, item.unit);
      lines.push(`${item.name}${price ? ` - ${price}` : ""}`);
      if (item.description) lines.push(`  ${item.description}`);
    }
  }
  return lines.join("\n");
}

// The neighbour to swap places with inside the same section, or null.
export function neighbour(items, id, direction) {
  const ordered = sortItems(items);
  const index = ordered.findIndex((i) => i.id === id);
  if (index < 0) return null;
  const section = ordered[index].section || "";
  const step = direction === "up" ? -1 : 1;
  for (let i = index + step; i >= 0 && i < ordered.length; i += step) if ((ordered[i].section || "") === section) return ordered[i];
  return null;
}

// ---------- the database ----------

const COLUMNS = "id, merchant_id, section, name, description, price, unit, status, position, created_by, created_at, updated_at";
const fail = (message, error) => Object.assign(new Error(message), { code: error?.code });

export async function listItems(supabase, merchantId) {
  const { data, error } = await supabase.from("sync_menu_items").select(COLUMNS).eq("merchant_id", merchantId).limit(ITEM_LIMIT + 200);
  if (error) throw fail("The list could not be read.", error);
  return sortItems(data || []);
}

export async function createItem(supabase, merchantId, values, userId, now, position) {
  const row = { id: globalThis.crypto.randomUUID(), section: "", description: "", price: null, unit: "", status: "draft", ...values, position, merchant_id: merchantId, created_by: userId, updated_at: now };
  const { data, error } = await supabase.from("sync_menu_items").insert(row).select(COLUMNS);
  if (error) throw fail("The item could not be saved.", error);
  return Array.isArray(data) ? data[0] : data;
}

export async function updateItem(supabase, merchantId, id, values, now) {
  const { data, error } = await supabase.from("sync_menu_items").update({ ...values, updated_at: now }).eq("merchant_id", merchantId).eq("id", id).select(COLUMNS);
  if (error) throw fail("The item could not be saved.", error);
  return (Array.isArray(data) ? data[0] : data) || null;
}

// Every item of one status to another: "send" is draft to waiting, "confirm" is waiting to confirmed. -> how many changed.
export async function moveAll(supabase, merchantId, from, to, now) {
  const { data, error } = await supabase.from("sync_menu_items").update({ status: to, updated_at: now }).eq("merchant_id", merchantId).eq("status", from).select("id");
  if (error) throw fail("The items could not be saved.", error);
  return Array.isArray(data) ? data.length : 0;
}

export async function deleteItem(supabase, merchantId, id) {
  const { data, error } = await supabase.from("sync_menu_items").delete().eq("merchant_id", merchantId).eq("id", id).select("id");
  if (error) throw fail("The item could not be removed.", error);
  return Array.isArray(data) && data.length > 0;
}
