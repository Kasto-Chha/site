// Declarative config for admin-managed content. Pure data (no functions) so it
// can be imported on both the server (API validation, list pages) and the client
// (the editor form). Each type maps to a Supabase table; `fields` drives the
// generated form and the API's column whitelist + coercion.
//
// field.type: "text" | "textarea" | "number" | "select" | "color"

import { topicSlug } from "../slug";

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
      { name: "slug", label: "URL slug", type: "text", placeholder: "mobile-data-price-hike", help: "Optional. Leave blank to generate from the question. This is what people see when the link is shared." },
      { name: "category", label: "Category", type: "text", required: true, placeholder: "Technology" },
      { name: "description", label: "Prompt", type: "textarea", placeholder: "NTC ra Ncell ko price increase — worth it ki overpriced?" },
      { name: "rank", label: "Rank (sort order)", type: "number", default: 1 },
      { name: "yes_label", label: "Positive label", type: "text", default: "Thik Chha" },
      { name: "mid_label", label: "Neutral label", type: "text", default: "Thikai Chha" },
      { name: "no_label", label: "Negative label", type: "text", default: "Thik Chhaina" },
      { name: "votes_yes", label: "Positive votes", type: "number", default: 0 },
      { name: "votes_mid", label: "Neutral votes", type: "number", default: 0 },
      { name: "votes_no", label: "Negative votes", type: "number", default: 0 },
      { name: "trend_note", label: "Trend note", type: "text", placeholder: "up 12%" },
      { name: "badge_label", label: "Badge label", type: "text", placeholder: "Hot" },
      { name: "badge_tone", label: "Badge tone", type: "select", options: ["neutral", "red", "green", "gold"], default: "neutral" },
      { name: "likes", label: "Likes", type: "number", default: 0 },
      { name: "comments", label: "Comments", type: "number", default: 0 }
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
      { name: "category", label: "Category", type: "text", required: true, placeholder: "Soft Drink" },
      { name: "slug", label: "URL slug", type: "text", placeholder: "coke-vs-pepsi", help: "Optional. Leave blank to build it from both sides, e.g. nepal-vs-uae. This is what people see when the link is shared." },
      { name: "order", label: "Order", type: "number", default: 1 },
      { name: "left_title", label: "Left name", type: "text", required: true, placeholder: "Coca-Cola" },
      { name: "left_desc", label: "Left tagline", type: "text", placeholder: "Classic taste, sabai le manparaune" },
      { name: "left_votes", label: "Left votes", type: "number", default: 0 },
      { name: "left_color", label: "Left colour (hex)", type: "color", default: "#c8102e", help: "Used for the gradient when no image is set." },
      { name: "left_image", label: "Left image URL", type: "text", placeholder: "https://… (optional)" },
      { name: "right_title", label: "Right name", type: "text", required: true, placeholder: "Pepsi" },
      { name: "right_desc", label: "Right tagline", type: "text", placeholder: "Sweeter, younger crowd ko choice" },
      { name: "right_votes", label: "Right votes", type: "number", default: 0 },
      { name: "right_color", label: "Right colour (hex)", type: "color", default: "#1f5fae", help: "Used for the gradient when no image is set." },
      { name: "right_image", label: "Right image URL", type: "text", placeholder: "https://… (optional)" }
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
      { name: "slug", label: "URL slug", type: "text", placeholder: "how-lokta-paper-outlived-empires", help: "Optional. Leave blank to generate from the title. Once a story is published, changing this changes its URL — anyone linking to the old one gets a 404, so treat it as fixed after launch." },
      { name: "slot", label: "Slot", type: "select", options: ["main", "side"], default: "main", help: '"main" is the large card; "side" fills the two smaller slots.' },
      { name: "author_name", label: "Author", type: "text", placeholder: "Pradip Karki", help: "Who wrote this. Shown as a byline and published as the article's author in structured data — worth filling in, especially for Paisa and Health pieces." },
      { name: "why_text", label: "Why eyebrow", type: "text", placeholder: "WHY IT MATTERS" },
      { name: "description", label: "Description", type: "textarea", placeholder: "Short summary of the story." },
      { name: "body", label: "Article", type: "textarea", placeholder: "The full story. Leave a blank line between paragraphs.", help: "Optional. Filled in, the story reads as a post on its own page. Left empty, the card is just a link." },
      { name: "link_url", label: "Link URL", type: "text", placeholder: "/trending", help: "Optional override. Set this only to send readers somewhere else instead of this story's own page." },
      { name: "image_url", label: "Hero image URL", type: "text", placeholder: "https://...", help: "Optional. Shown as the story's photo on every card and at the top of its own page. Leave blank to fall back to the icon below." },
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
      { name: "tag", label: "Channel tag", type: "text", required: true, placeholder: "Paisa" },
      { name: "handle", label: "Handle", type: "text", placeholder: "@kasto_chha_paisa" },
      { name: "order", label: "Order", type: "number", default: 1 },
      { name: "accent", label: "Card accent (hex)", type: "color", default: "#5a1f24", help: "Poster gradient colour for the card." },
      { name: "video_url", label: "Embed link", type: "text", placeholder: "YouTube / Instagram / TikTok / Vimeo URL", help: "Plays inline via the platform's player — no video is stored. Search/profile links just open in a new tab." },
      { name: "channel_url", label: "Channel link (optional)", type: "text", placeholder: "https://… profile or channel" }
    ]
  }
};

export const CONTENT_TYPE_KEYS = Object.keys(CONTENT_TYPES);

export function getContentType(type) {
  return CONTENT_TYPES[type] || null;
}

// Build a clean, typed payload from raw form/body values, limited to known
// columns. Returns { values, error }.
export function sanitizeContent(type, body = {}) {
  const config = getContentType(type);
  if (!config) return { error: "Unknown content type." };

  const values = {};
  for (const field of config.fields) {
    let raw = body[field.name];

    if (field.type === "number") {
      if (raw === "" || raw === null || raw === undefined) {
        raw = field.default ?? 0;
      }
      const num = Number(raw);
      values[field.name] = Number.isFinite(num) ? num : (field.default ?? 0);
      continue;
    }

    if (raw === null || raw === undefined) raw = "";
    raw = raw.toString().trim();

    if (!raw) {
      if (field.required) {
        return { error: `"${field.label}" is required.` };
      }
      // Empty optional text -> null so the DB default/NULL applies.
      values[field.name] = field.default !== undefined && field.type === "select" ? field.default : null;
      continue;
    }

    values[field.name] = raw;
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

    const generated = topicSlug(source);
    if (!generated) {
      return { error: "Could not build a URL slug from that title. Enter one manually." };
    }
    values.slug = generated;
  }

  return { values };
}
