// Every outbound KastoChha link in one place — the footer's "Our Channels" and
// "Follow Us" columns, and the Reels rail's "Follow us ->".
//
// Previously these were inline arrays in HomeClient with placeholder hrefs
// (facebook.com, tiktok.com, "#"), so a visitor clicking "Facebook" landed on
// Facebook's own homepage. Anything with an empty `url` here is filtered out of
// the render instead of shipping a dead link, so adding an account is a
// one-line change and removing one needs no component edits.

const IG = (handle) => `https://www.instagram.com/${handle}/`;

// Niche channels, in the order they should appear. Order = brand priority, and
// deliberately matches lib/categories.js so the footer and the category pickers
// present the niches the same way round.
//
// NOTE: the last four handles are derived from the naming pattern of the five
// confirmed accounts (kasto_chha_paisa, _motors, _foods, _entertainment,
// _tech_gadgets) — they are not verified. Correct them here if an account uses
// a different handle, or blank the url to hide the row until it launches.
export const CHANNELS = [
  { label: "KastoChha Paisa", url: IG("kasto_chha_paisa") },
  { label: "KastoChha Motors", url: IG("kasto_chha_motors") },
  { label: "KastoChha Tech & Gadgets", url: IG("kasto_chha_tech_gadgets") },
  { label: "KastoChha Food", url: IG("kasto_chha_foods") },
  { label: "KastoChha Entertainment", url: IG("kasto_chha_entertainment") },
  { label: "KastoChha Travel", url: IG("kasto_chha_travels") },
  { label: "KastoChha Career", url: IG("kasto_chha_career") },
  { label: "KastoChha Health & Lifestyle", url: IG("kasto_chha_health_lifestyle") },
  { label: "KastoChha Muglan", url: IG("kasto_chha_muglan") }
];

// Main brand accounts. Only Instagram is confirmed; fill a url in to publish
// that row — an empty string keeps the platform listed here as a reminder
// without rendering a link that goes nowhere.
export const SOCIALS = [
  { label: "Instagram", url: IG("kasto_chha") },
  { label: "Facebook", url: "" },
  { label: "TikTok", url: "" },
  { label: "YouTube", url: "" }
];

// The Reels rail's "Follow us ->". Falls back to a YouTube search for the brand
// until the real channel url is set on the YouTube entry above, so the link
// always lands somewhere useful.
export const YOUTUBE_FALLBACK =
  "https://www.youtube.com/results?search_query=kastochha";

export function youtubeChannelUrl() {
  const youtube = SOCIALS.find((social) => social.label === "YouTube");
  return youtube?.url || YOUTUBE_FALLBACK;
}

// Drop anything without a destination before it reaches the DOM.
export function liveLinks(items) {
  return items.filter((item) => Boolean(item.url));
}
