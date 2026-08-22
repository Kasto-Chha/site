// Web app manifest.
//
// Worth having for a Nepali audience specifically: most traffic arrives from
// TikTok, Instagram and Facebook on Android, and "Add to Home Screen" is the
// closest thing to an app install without shipping one. Without a manifest,
// Chrome won't offer it at all.
//
// A route rather than a static file so the start_url and icons stay in step
// with NEXT_PUBLIC_SITE_URL instead of being hardcoded in two places.
export default function manifest() {
  return {
    name: "KastoChha - Nepal's Curious Community Network",
    short_name: "KastoChha",
    description:
      "Real reviews, honest opinions, and shared experiences from across Nepal.",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F0E8",
    theme_color: "#F5F0E8",
    // Matches lib/seo/schema.js — the site is written in English with Romanised
    // Nepali throughout the community content.
    lang: "en-NP",
    dir: "ltr",
    categories: ["social", "news", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Maskable icons are cropped to whatever shape the launcher uses — circle,
      // squircle, rounded square. This one has extra padding so the wordmark
      // survives the crop rather than losing its edges.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
