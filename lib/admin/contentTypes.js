// Declarative config for admin-managed content, imported on both the server
// (API validation, list pages) and the client (the editor form). Each type maps
// to a Supabase table; `fields` drives the generated form and the API's column
// whitelist + validation.
//
// field.type: "text" | "textarea" | "number" | "select" | "color" | "url" | "slug"
//   text/textarea  maxLength (defaults below)
//   number         whole numbers only, between min and max
//   url            https:// only, or also site-relative ("/trending") with
//                  allowRelative
//   select         one of `options`

import { topicSlug } from "../slug";

// Ceilings. Counts sit well inside Postgres int and far above any real total;
// the point is that a typo cannot plant a negative or absurd number that then
// renders on the homepage.
export const FIELD_LIMITS = {
  count: 10_000_000,
  sort: 10_000,
  slug: 120,
  text: 200,
  textarea: 2000,
  url: 2048
};

const COUNT = { type: "number", min: 0, max: FIELD_LIMITS.count, default: 0 };
const SORT = { type: "number", min: 0, max: FIELD_LIMITS.sort, default: 1 };

export const CONTENT_TYPES = {
  trending: {
    table: "trending_topics",
    label: "Trending topics",
    singular: "trending topic",
    blurb: "Poll questions on the homepage Trending grid.",
    order: { column: "rank", ascending: true },
    titleField: "title",
    subtitleField: "category",
    fields: [
      { name: "title", label: "Question", type: "text", required: true, placeholder: "Mobile data price hike kasto chha?" },
      { name: "slug", label: "URL slug", type: "slug", placeholder: "mobile-data-price-hike", help: "Optional. Leave blank to generate from the question. This is what people see when the link is shared." },
      { name: "category", label: "Category", type: "text", required: true, maxLength: 60, placeholder: "Technology" },
      { name: "description", label: "Prompt", type: "textarea", placeholder: "NTC ra Ncell ko price increase — worth it ki overpriced?" },
      { name: "rank", label: "Rank (sort order)", ...SORT },
      { name: "yes_label", label: "Positive label", type: "text", maxLength: 40, default: "Thik Chha" },
      { name: "mid_label", label: "Neutral label", type: "text", maxLength: 40, default: "Thikai Chha" },
      { name: "no_label", label: "Negative label", type: "text", maxLength: 40, default: "Thik Chhaina" },
      { name: "votes_yes", label: "Positive votes", ...COUNT },
      { name: "votes_mid", label: "Neutral votes", ...COUNT },
      { name: "votes_no", label: "Negative votes", ...COUNT },
      { name: "trend_note", label: "Trend note", type: "text", maxLength: 40, placeholder: "up 12%" },
      { name: "badge_label", label: "Badge label", type: "text", maxLength: 30, placeholder: "Hot" },
      { name: "badge_tone", label: "Badge tone", type: "select", options: ["neutral", "red", "green", "gold"], default: "neutral" },
      { name: "likes", label: "Likes", ...COUNT },
      { name: "comments", label: "Comments", ...COUNT }
    ]
  },

  battles: {
    table: "battles",
    label: "Battles",
    singular: "battle",
    blurb: "Head-to-head split-screen votes.",
    order: { column: "order", ascending: true },
    titleField: "left_title",
    subtitleField: "category",
    fields: [
      { name: "category", label: "Category", type: "text", required: true, maxLength: 60, placeholder: "Soft Drink" },
      { name: "slug", label: "URL slug", type: "slug", placeholder: "coke-vs-pepsi", help: "Optional. Leave blank to build it from both sides, e.g. nepal-vs-uae. This is what people see when the link is shared." },
      { name: "order", label: "Order", ...SORT },
      { name: "left_title", label: "Left name", type: "text", required: true, maxLength: 100, placeholder: "Coca-Cola" },
      { name: "left_desc", label: "Left tagline", type: "text", placeholder: "Classic taste, sabai le manparaune" },
      { name: "left_votes", label: "Left votes", ...COUNT },
      { name: "left_color", label: "Left colour (hex)", type: "color", default: "#c8102e", help: "Used for the gradient when no image is set." },
      { name: "left_image", label: "Left image URL", type: "url", allowRelative: true, placeholder: "https://… (optional)" },
      { name: "right_title", label: "Right name", type: "text", required: true, maxLength: 100, placeholder: "Pepsi" },
      { name: "right_desc", label: "Right tagline", type: "text", placeholder: "Sweeter, younger crowd ko choice" },
      { name: "right_votes", label: "Right votes", ...COUNT },
      { name: "right_color", label: "Right colour (hex)", type: "color", default: "#1f5fae", help: "Used for the gradient when no image is set." },
      { name: "right_image", label: "Right image URL", type: "url", allowRelative: true, placeholder: "https://… (optional)" }
    ]
  },

  featured: {
    table: "featured_stories",
    label: "Featured stories",
    singular: "featured story",
    blurb: "Editor-pick cards in the Featured section.",
    order: { column: "slot", ascending: true },
    titleField: "title",
    subtitleField: "slot",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, placeholder: "How to save on mobile" },
      { name: "slug", label: "URL slug", type: "slug", placeholder: "how-lokta-paper-outlived-empires", help: "Optional. Leave blank to generate from the title. Once a story is published, changing this changes its URL — anyone linking to the old one gets a 404, so treat it as fixed after launch." },
      { name: "slot", label: "Slot", type: "select", options: ["main", "side"], default: "main", help: '"main" is the large card; "side" fills the two smaller slots.' },
      { name: "author_name", label: "Author", type: "text", maxLength: 100, placeholder: "Pradip Karki", help: "Who wrote this. Shown as a byline and published as the article's author in structured data — worth filling in, especially for Paisa and Health pieces." },
      { name: "why_text", label: "Why eyebrow", type: "text", maxLength: 60, placeholder: "WHY IT MATTERS" },
      { name: "description", label: "Description", type: "textarea", placeholder: "Short summary of the story." },
      { name: "body", label: "Article", type: "textarea", maxLength: 100_000, placeholder: "The full story. Leave a blank line between paragraphs.", help: "Optional. Filled in, the story reads as a post on its own page. Left empty, the card is just a link. Formatting: \"## \", \"### \", \"#### \" at the start of a line for subheadings (H2-H4 — there's no H1 option, since the title above is already the page's one H1). **text** for bold, *text* for italic, [link text](https://...) for a link, and a block of lines starting with \"- \" for a bullet list." },
      { name: "link_url", label: "Link URL", type: "url", allowRelative: true, placeholder: "/trending", help: "Optional override. Set this only to send readers somewhere else instead of this story's own page." },
      { name: "image_url", label: "Hero image URL", type: "url", allowRelative: true, placeholder: "https://...", help: "Optional. Shown as the story's photo on every card and at the top of its own page. Leave blank to fall back to the icon below." },
      { name: "image_alt", label: "Image alt text", type: "text", maxLength: 300, placeholder: "A rider charging a BYD Atto 3 in Kathmandu", help: "Describe what's actually in the photo — read aloud by screen readers, and it's what Google Images uses to understand and surface the picture. Left blank, the story title is used instead, which works but says nothing about the photo itself." },
      { name: "icon", label: "Icon (used when no hero image is set)", type: "select", options: ["book", "home", "briefcase"], default: "book" }
    ]
  },

  reels: {
    table: "reels",
    label: "Reels",
    singular: "reel",
    blurb: "Embedded video reels — paste a link, nothing is stored.",
    order: { column: "order", ascending: true },
    titleField: "title",
    subtitleField: "tag",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, placeholder: "IPO ma paisa lagaune ho?" },
      { name: "tag", label: "Channel tag", type: "text", required: true, maxLength: 40, placeholder: "Paisa" },
      { name: "handle", label: "Handle", type: "text", maxLength: 60, placeholder: "@kasto_chha_paisa" },
      { name: "order", label: "Order", ...SORT },
      { name: "accent", label: "Card accent (hex)", type: "color", default: "#5a1f24", help: "Poster gradient colour for the card." },
      { name: "video_url", label: "Embed link", type: "url", placeholder: "YouTube / Instagram / TikTok / Vimeo URL", help: "Plays inline via the platform's player — no video is stored. Search/profile links just open in a new tab." },
      { name: "channel_url", label: "Channel link (optional)", type: "url", placeholder: "https://… profile or channel" }
    ]
  }
};

export const CONTENT_TYPE_KEYS = Object.keys(CONTENT_TYPES);

export function getContentType(type) {
  return CONTENT_TYPES[type] || null;
}

// The longest value a field accepts, for the API and the editor's maxLength.
export function fieldMaxLength(field) {
  if (field.maxLength) return field.maxLength;
  if (field.type === "slug") return FIELD_LIMITS.slug;
  if (field.type === "url") return FIELD_LIMITS.url;
  if (field.type === "textarea") return FIELD_LIMITS.textarea;
  if (field.type === "color") return 7;
  return FIELD_LIMITS.text;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// https:// with a real host and no embedded credentials — or, where the field
// allows it, a path on this site. "//evil.com" and "/\evil.com" both look like
// paths but browsers treat them as other hosts, so neither counts as relative.
// Whitespace and control characters are refused outright: they are how a URL
// that validates here gets read differently by a browser.
export function isAllowedUrl(value, { allowRelative = false } = {}) {
  if (/[\s\u0000-\u001f\u007f\\]/.test(value)) return false;
  if (value.startsWith("/")) return allowRelative && !value.startsWith("//");
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
}

// A generated slug longer than the limit is cut back to the last whole word.
function clampSlug(slug) {
  const clean = slug.replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (clean.length <= FIELD_LIMITS.slug) return clean;
  const cut = clean.slice(0, FIELD_LIMITS.slug);
  const lastBreak = cut.lastIndexOf("-");
  return (lastBreak > 0 ? cut.slice(0, lastBreak) : cut).replace(/-$/, "");
}

// One field's raw value -> { value } or { error }. Nothing is coerced into
// range: a value that is wrong is an error the editor sees, not a zero it
// doesn't notice.
function validateField(field, raw) {
  const label = `"${field.label}"`;

  if (field.type === "number") {
    if (raw === "" || raw === null || raw === undefined) return { value: field.default ?? 0 };
    const num = typeof raw === "number" ? raw : Number(raw.toString().trim());
    const min = field.min ?? 0;
    const max = field.max ?? FIELD_LIMITS.count;
    if (!Number.isInteger(num) || num < min || num > max) {
      return { error: `${label} must be a whole number from ${min} to ${max.toLocaleString("en-US")}.` };
    }
    return { value: num };
  }

  const text = raw === null || raw === undefined ? "" : raw.toString().trim();

  if (!text) {
    if (field.required) return { error: `${label} is required.` };
    // Empty optional -> null so the DB default/NULL applies; a select falls
    // back to its default option.
    return { value: field.type === "select" ? field.default ?? null : null };
  }

  const max = fieldMaxLength(field);
  if (text.length > max) {
    return { error: `${label} is too long (max ${max.toLocaleString("en-US")} characters).` };
  }

  if (field.type === "select" && !field.options.includes(text)) {
    return { error: `${label} must be one of: ${field.options.join(", ")}.` };
  }
  if (field.type === "color" && !HEX_COLOR.test(text)) {
    return { error: `${label} must be a hex colour like #c8102e.` };
  }
  if (field.type === "slug" && !SLUG.test(text)) {
    return {
      error: `${label} may only use lowercase letters, numbers and single hyphens, like coke-vs-pepsi.`
    };
  }
  if (field.type === "url" && !isAllowedUrl(text, field)) {
    return {
      error: field.allowRelative
        ? `${label} must start with https:// or be a path on this site like /trending.`
        : `${label} must start with https://.`
    };
  }

  return { value: text };
}

// Build a clean, typed payload from raw form/body values, limited to known
// columns. Returns { values } or { error } for the first field that fails.
export function sanitizeContent(type, body = {}) {
  const config = getContentType(type);
  if (!config) return { error: "Unknown content type." };

  const values = {};
  for (const field of config.fields) {
    const result = validateField(field, body[field.name]);
    if (result.error) return { error: result.error };
    values[field.name] = result.value;
  }

  // A slug left blank is generated, so an editor never has to think about URLs
  // unless they want to. Explicit beats generated: the ten articles migrating
  // from the old site keep their existing slugs by having them typed in, which
  // is why this only fills a gap rather than overwriting.
  //
  // A battle has no single title — the comparison is the point — so it slugs
  // from both sides: "nepal-vs-uae".
  if (config.fields.some((field) => field.name === "slug") && !values.slug) {
    const source =
      type === "battles"
        ? `${values.left_title || ""} vs ${values.right_title || ""}`
        : values.title || "";

    const generated = clampSlug(topicSlug(source));
    if (!SLUG.test(generated)) {
      return { error: "Could not build a URL slug from that title. Enter one manually." };
    }
    values.slug = generated;
  }

  return { values };
}
