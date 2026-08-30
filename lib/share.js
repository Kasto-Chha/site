// Shared helpers for content permalinks and their social-preview (OG) images.
// Keeping this in one place means cards, permalink pages, and the OG endpoint
// all agree on URLs.

export const SHARE_PATHS = {
  // Slugs throughout. Discussions and Featured use them to rank; Trending and
  // Battle use them because these are the pages that get shared, and a readable
  // link is the difference between a tap and a shrug.
  trending: (slug) => `/trending/${slug}`,
  battles: (slug) => `/battle/${slug}`,
  battle: (slug) => `/battle/${slug}`,
  // Discussions are addressed by topic slug, not by an experience's id: one
  // topic is one page, so every experience in a thread shares this URL.
  discussions: (slug) => `/discussions/${slug}`,
  // Also a slug, for the same reason as discussions: the URL should read.
  featured: (slug) => `/featured/${slug}`
};

export function permalink(type, id) {
  const fn = SHARE_PATHS[type];
  return fn ? fn(id) : "/";
}

// Build the /api/og query string for a content item. Only short, display-safe
// fields are passed; the endpoint renders the branded card.
export function ogImagePath({ type, kicker, title, subtitle, stat }) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (kicker) params.set("kicker", kicker);
  if (title) params.set("title", title);
  if (subtitle) params.set("subtitle", subtitle);
  if (stat) params.set("stat", stat);
  return `/api/og?${params.toString()}`;
}

// Standard metadata block for a permalink page. `path` and the og image are
// relative; Next resolves them against metadataBase (NEXT_PUBLIC_SITE_URL).
// `image`/`imageAlt` are an explicit override — pass a real photo URL to use
// it as the share preview instead of the generated branded card. Every
// existing caller omits these and keeps exactly its current behavior; only
// Featured articles with a hero image pass them.
export function shareMetadata({ type, path, title, description, kicker, stat, image, imageAlt }) {
  const og = image || ogImagePath({ type, kicker, title, subtitle: description, stat });
  const alt = imageAlt || title;
  const fullTitle = `${title} - KastoChha`;
  return {
    title: fullTitle,
    description: description || "Real opinions from real people across Nepal.",
    alternates: { canonical: path },
    openGraph: {
      title,
      description: description || "Real opinions from real people across Nepal.",
      url: path,
      siteName: "KastoChha",
      type: "article",
      images: [{ url: og, width: 1200, height: 630, alt }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: description || "Real opinions from real people across Nepal.",
      images: [og]
    }
  };
}
