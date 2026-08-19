// Every outbound KastoChha link in one place — the footer's "Our Channels" and
// "Follow Us" columns, the contact page's channel grid, and the Reels rail's
// "Follow us ->".
//
// Previously these were inline arrays in HomeClient with placeholder hrefs
// (facebook.com, tiktok.com, "#"), so a visitor clicking "Facebook" landed on
// Facebook's own homepage. Anything with an empty `url` here is filtered out of
// the render instead of shipping a dead link, so adding an account is a
// one-line change and removing one needs no component edits.

const IG = (handle) => `https://www.instagram.com/${handle}/`;
const TT = (handle) => `https://www.tiktok.com/@${handle}`;
const YT = (handle) => `https://www.youtube.com/@${handle}`;

// Niche channels, in the order they should appear. Order = brand priority, and
// deliberately matches lib/categories.js so the footer and the category pickers
// present the niches the same way round.
//
// Each niche lives on whichever platform it actually publishes to — Motors and
// Tech are YouTube, the rest are TikTok — so these are not all one host.
// Health & Lifestyle has no account yet; the blank url keeps it listed here as
// a reminder while `liveLinks` hides the row until there's somewhere to send
// people.
export const CHANNELS = [
  { label: "KastoChha Paisa", url: TT("kasto_chha_paisa") },
  { label: "KastoChha Motors", url: YT("kasto_chha_motors") },
  { label: "KastoChha Tech & Gadgets", url: YT("KastoChha_Tech_Gadgets") },
  { label: "KastoChha Food", url: TT("kasto_chha_food") },
  { label: "KastoChha Entertainment", url: TT("kasto_chha_entertainment") },
  { label: "KastoChha Travel", url: TT("kasto_chha_travels") },
  { label: "KastoChha Career", url: TT("kasto_chha_career") },
  { label: "KastoChha Health & Lifestyle", url: "" },
  { label: "KastoChha Muglan", url: TT("kasto_chha_muglan") }
];

// Main brand accounts, most-used platform first. An empty string keeps a
// platform listed here as a reminder without rendering a link that goes
// nowhere.
export const SOCIALS = [
  { label: "Instagram", url: IG("kasto_chha") },
  { label: "Facebook", url: "https://www.facebook.com/kastochhanepal" },
  { label: "TikTok", url: TT("kasto_chha") },
  { label: "YouTube", url: YT("kasto_chha") },
  { label: "X", url: "https://x.com/Kasto_chha" },
  { label: "LinkedIn", url: "https://www.linkedin.com/company/kastochha/" },
  { label: "Reddit", url: "https://www.reddit.com/r/KastoChha/" },
  { label: "Pinterest", url: "https://www.pinterest.com/kastochhaofficial" },
  { label: "Quora", url: "https://kastochha.quora.com/" }
];

// The Reels rail's "Follow us ->". Falls back to a YouTube search for the brand
// if the YouTube entry above is ever blanked, so the link always lands
// somewhere useful.
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

// "@kasto_chha_food" for the contact page's channel cards. TikTok and YouTube
// already put the @ in the path and Instagram doesn't, but a multi-segment path
// isn't a handle at all — "r/KastoChha" and "company/kastochha" read correctly
// as-is, where "@r" and "@company" would be nonsense. A subdomain account
// (Quora) has no path to work with, so fall back to the host.
export function channelHandle(url) {
  try {
    const { hostname, pathname } = new URL(url);
    const segments = pathname.split("/").filter(Boolean);
    if (!segments.length) return hostname.replace(/^www\./, "");
    if (segments.length > 1) return segments.join("/");
    return segments[0].startsWith("@") ? segments[0] : `@${segments[0]}`;
  } catch {
    return "";
  }
}
