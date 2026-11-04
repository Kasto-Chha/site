import { CATEGORIES } from "../categories";
import { BUSINESS_TYPES, DEFAULT_BUSINESS_KIND, KIND_LABEL_MAX, OTHER_KIND, categoryForKind, isBusinessKind } from "./businessTypes";
import { mapsLinkFor, mapsLinkIsFor, reviewLinkFor, reviewLinkIsFor } from "./placeLinks";
import { isValidSlug, normalizeSlug, threadSlugFor } from "./slug";
import { topicSlug } from "../slug";

// What an admin may enter when tagging a business thread or editing it. Pure: no
// database, so the same rules run in the form's preview, the API and the tests.
//
// The database repeats the important ones as constraints (see 0018), so a bug here
// cannot store a bad address. The point of checking here too is a clear message.

export const BUSINESS_KINDS = BUSINESS_TYPES.map((t) => t.key);
const CATEGORY_LABELS = CATEGORIES.map((c) => c.label);
export const ABOUT_MAX = 300;
export const NAME_MAX = 120;
export const AREA_MAX = 80;
const URL_MAX = 500;

// Google's own links only. These become buttons customers tap on the business page,
// so an admin typing a look-alike address must not be able to point them elsewhere.
const GOOGLE_LINK_RULES = [
  { host: "search.google.com", prefix: "/local/" },
  { host: "g.page", prefix: "/" },
  { host: "maps.app.goo.gl", prefix: "/" },
  { host: "maps.google.com", prefix: "/" },
  { host: "www.google.com", prefix: "/maps" },
  { host: "google.com", prefix: "/maps" }
];

export function cleanLine(value, max) {
  return (value ?? "").toString().replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1);
}

export function cleanParagraph(value, max) {
  return (value ?? "")
    .toString()
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max + 1);
}

// Returns the normalised link, "" when empty, or null when it is not an accepted
// Google link.
export function googleLink(value) {
  const text = (value ?? "").toString().trim();
  if (!text) return "";
  if (text.length > URL_MAX) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const rule = GOOGLE_LINK_RULES.find((r) => r.host === host && url.pathname.startsWith(r.prefix));
  return rule ? url.toString() : null;
}

export function placeId(value) {
  const text = (value ?? "").toString().trim();
  if (!text) return "";
  return /^[A-Za-z0-9_-]{10,200}$/.test(text) ? text : null;
}

// A hub address to suggest when the admin has not typed one: the business's name.
export function suggestHubSlug({ name, area } = {}) {
  const byName = topicSlug((name ?? "").toString());
  if (byName && isValidSlug(byName, 80)) return byName;
  const withArea = threadSlugFor({ name, area });
  return withArea && isValidSlug(withArea, 80) ? withArea : "";
}

// What an Other business is, in the admin's own words: trimmed and tidied, at least two
// characters, at most KIND_LABEL_MAX. Nothing else is asked of it.
function kindLabelFrom(raw) {
  const label = cleanLine(raw, KIND_LABEL_MAX);
  if (label.length < 2) return { error: "Write what this business is, for example Motorcycle workshop." };
  if (label.length > KIND_LABEL_MAX) return { error: `What the business is can be at most ${KIND_LABEL_MAX} characters.` };
  return { label };
}

function details(input, { partial, current }) {
  const values = {};
  const has = (key) => !partial || input[key] !== undefined;

  if (has("businessName")) {
    const name = cleanLine(input.businessName, NAME_MAX);
    if (!name) return { error: "Enter the business's name." };
    if (name.length > NAME_MAX) return { error: `The name can be at most ${NAME_MAX} characters.` };
    values.business_name = name;
  }
  if (has("area")) {
    const area = cleanLine(input.area, AREA_MAX);
    if (!area) return { error: "Enter the area, for example Jhamsikhel." };
    if (area.length > AREA_MAX) return { error: `The area can be at most ${AREA_MAX} characters.` };
    values.area = area;
  }
  // The category is worked out from the business type, here on the server. It can be
  // changed by hand, deliberately: the form then sends categoryOverride, which must be
  // one of KastoChha's own categories. A plain "category" field is never read, so a
  // stale value a browser has kept from an earlier choice cannot get through.
  if (has("businessKind")) {
    const kind = (input.businessKind ?? DEFAULT_BUSINESS_KIND).toString().trim() || DEFAULT_BUSINESS_KIND;
    if (!isBusinessKind(kind)) return { error: "Choose a business type from the list." };
    values.business_kind = kind;
    values.category = categoryForKind(kind);
  }
  // An Other business must say what it is, and every other type has no such words. The
  // words only change together with the type, or on their own for a business that is
  // already Other (handled in validateUpdate).
  if (values.business_kind !== undefined) {
    if (values.business_kind === OTHER_KIND) {
      const keep = input.kindLabel === undefined && current && current.business_kind === OTHER_KIND ? current.kind_label : undefined;
      const parsed = kindLabelFrom(input.kindLabel === undefined ? keep : input.kindLabel);
      if (parsed.error) return { error: parsed.error };
      values.kind_label = parsed.label;
    } else {
      values.kind_label = null;
    }
  }
  const override = (input.categoryOverride ?? "").toString().trim();
  if (override) {
    if (!CATEGORY_LABELS.includes(override)) return { error: "Choose one of KastoChha's categories." };
    values.category = override;
  }
  if (has("about")) {
    const about = cleanParagraph(input.about, ABOUT_MAX);
    if (about.length > ABOUT_MAX) return { error: `The About text can be at most ${ABOUT_MAX} characters.` };
    values.about = about || null;
  }
  if (has("googlePlaceId")) {
    const id = placeId(input.googlePlaceId);
    if (id === null) return { error: "That does not look like a Google place ID." };
    values.google_place_id = id || null;
  }
  if (has("googleReviewUrl")) {
    const link = googleLink(input.googleReviewUrl);
    if (link === null) return { error: "The review link must be a Google link (search.google.com, g.page or maps.app.goo.gl)." };
    values.google_review_url = link || null;
  }
  if (has("googleMapsUrl")) {
    const link = googleLink(input.googleMapsUrl);
    if (link === null) return { error: "The Maps link must be a Google Maps link." };
    values.google_maps_url = link || null;
  }
  return { values };
}

// Tagging a business for the first time. threadMode is "existing" (link a thread that
// already has posts, by its slug) or "new" (start one from "Name, Area").
export function validateCreate(input = {}) {
  const base = details(input, { partial: false });
  if (base.error) return { error: base.error };
  const values = base.values;

  const mode = (input.threadMode ?? "").toString();
  if (mode === "existing") {
    const slug = normalizeSlug(input.threadSlug);
    if (!isValidSlug(slug, 120)) return { error: "Pick the thread to link." };
    values.topic_slug = slug;
  } else if (mode === "new") {
    const slug = threadSlugFor({ name: values.business_name, area: values.area });
    if (!slug || !isValidSlug(slug, 120)) return { error: "That name and area do not make a usable thread address." };
    values.topic_slug = slug;
  } else {
    return { error: "Say whether to link an existing thread or start a new one." };
  }

  // Links left empty are built from the place ID, when there is one.
  if (values.google_place_id) {
    if (!values.google_review_url) values.google_review_url = reviewLinkFor(values.google_place_id);
    if (!values.google_maps_url) values.google_maps_url = mapsLinkFor(values.google_place_id, values.business_name);
  }

  const hub = normalizeSlug(input.hubSlug) || suggestHubSlug({ name: values.business_name, area: values.area });
  if (!isValidSlug(hub, 80)) {
    return { error: "The hub address can use lowercase letters, numbers and single hyphens, up to 80 characters." };
  }
  values.slug = hub;
  values.status = "active";
  return { values, threadMode: mode };
}

// Editing details. The two addresses are fixed once a business is tagged: renaming a
// café must never split its thread, so an attempt to change either is refused.
export function validateUpdate(input = {}, current = {}) {
  for (const [field, column] of [["hubSlug", "slug"], ["threadSlug", "topic_slug"], ["topicSlug", "topic_slug"], ["slug", "slug"]]) {
    if (input[field] !== undefined && normalizeSlug(input[field]) !== current[column]) {
      return { error: "The addresses cannot be changed after a business is tagged." };
    }
  }
  const base = details(input, { partial: true, current });
  if (base.error) return { error: base.error };
  const values = base.values;
  // New words for a business that is already Other, without changing its type.
  if (input.kindLabel !== undefined && input.businessKind === undefined && current.business_kind === OTHER_KIND) {
    const parsed = kindLabelFrom(input.kindLabel);
    if (parsed.error) return { error: parsed.error };
    values.kind_label = parsed.label;
  }
  // The links follow the place ID. A link sent empty is built from it, and a link that was
  // built for the old ID is rebuilt for the new one, rather than left pointing at the old place.
  const placeId = values.google_place_id !== undefined ? values.google_place_id : current.google_place_id;
  if (placeId) {
    const oldId = current.google_place_id;
    const changed = Boolean(oldId) && oldId !== placeId;
    const name = values.business_name !== undefined ? values.business_name : current.business_name;
    if (values.google_review_url !== undefined && (values.google_review_url === null || (changed && reviewLinkIsFor(values.google_review_url, oldId)))) {
      values.google_review_url = reviewLinkFor(placeId);
    }
    if (values.google_maps_url !== undefined && (values.google_maps_url === null || (changed && mapsLinkIsFor(values.google_maps_url, oldId)))) {
      values.google_maps_url = mapsLinkFor(placeId, name);
    }
  }
  const resetOnly = input.categoryOverride !== undefined && !(input.categoryOverride ?? "").toString().trim() && input.businessKind === undefined;
  if (resetOnly && current.business_kind) values.category = categoryForKind(current.business_kind);
  if (input.status !== undefined) {
    if (!["active", "cancelled"].includes(input.status)) return { error: "Status must be active or cancelled." };
    values.status = input.status;
  }
  if (Object.keys(values).length === 0) return { error: "There is nothing to change." };
  values.updated_at = new Date().toISOString();
  return { values };
}
