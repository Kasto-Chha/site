// ---------------------------------------------------------------------------
// Structured data (JSON-LD).
//
// Before this, the only structured data on the site was a single generic
// WebSite block, repeated unchanged on every page — homepage, discussion
// thread, article, all identical. It told search engines the site exists and
// nothing else.
//
// What's here instead:
//
//   Organization           who publishes this, and every account that proves it
//   WebSite + SearchAction the site itself, and that it has a search
//   BreadcrumbList         where a page sits in the structure
//   DiscussionForumPosting a community thread, with its replies
//   Article                a written piece, with a named author
//
// Deliberately NOT here:
//
//   AggregateRating / Review on the Ramro/Thikai/Naramro counts or Battle vote
//   splits. Those are polls, not ratings — a vote on "is this good?" is not a
//   star rating of a product. Marking them up as ratings misrepresents them and
//   risks a manual structured-data action, which is a far worse outcome than
//   having no rating markup at all.
//
//   FAQPage — Google retired rich results for it in May 2026.
//
//   HowTo — nothing on the site is a how-to.
// ---------------------------------------------------------------------------

import { CHANNELS, SOCIALS } from "../channels";

// Every account KastoChha actually publishes to: 9 brand profiles plus the
// per-niche channels. Blank urls are placeholders in lib/channels.js for
// accounts that don't exist yet — filtered out, because claiming a profile that
// isn't there is worse than claiming fewer.
//
// This matters more than it looks. sameAs is how a search engine connects a
// name to the accounts that establish it, and the whole footprint has been
// invisible until now.
export function brandProfiles() {
  return [...SOCIALS, ...CHANNELS]
    .map((item) => item.url)
    .filter((url) => typeof url === "string" && url.startsWith("http"));
}

export function organizationSchema(siteUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: "KastoChha",
    url: siteUrl,
    logo: `${siteUrl}/kastochha-logo.svg`,
    description:
      "Nepal's community network for real reviews, honest opinions, and shared experiences.",
    foundingLocation: {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressCountry: "NP" }
    },
    sameAs: brandProfiles()
  };
}

export function websiteSchema(siteUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    name: "KastoChha",
    url: siteUrl,
    description: "Community powered opinions from across Nepal.",
    inLanguage: ["en-NP", "ne"],
    publisher: { "@id": `${siteUrl}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/chat?q={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    }
  };
}

// `trail` is [{ name, path }] from the section down to the current page. The
// homepage is prepended here so callers don't repeat it.
export function breadcrumbSchema(siteUrl, trail = []) {
  const items = [{ name: "Home", path: "" }, ...trail];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${siteUrl}${item.path}`
    }))
  };
}

// A discussion thread: an opening post plus the experiences replying to it.
// DiscussionForumPosting is the type Google documents for exactly this shape,
// and it's a much better fit than trying to describe a thread as an Article.
export function discussionSchema(siteUrl, { slug, title, experiences = [] }) {
  const [op, ...replies] = experiences;
  if (!op) return null;

  const authorOf = (item) => ({
    "@type": "Person",
    name: item.author_name || "KastoChha community"
  });

  return {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    "@id": `${siteUrl}/discussions/${slug}#post`,
    url: `${siteUrl}/discussions/${slug}`,
    headline: title,
    text: op.summary || title,
    datePublished: op.created_at,
    dateModified: experiences.reduce(
      (latest, item) =>
        new Date(item.created_at) > new Date(latest) ? item.created_at : latest,
      op.created_at
    ),
    author: authorOf(op),
    publisher: { "@id": `${siteUrl}/#organization` },
    // Real reply count, not the seeded comment_count column.
    commentCount: replies.length,
    comment: replies.map((item) => ({
      "@type": "Comment",
      text: item.summary || "",
      datePublished: item.created_at,
      author: authorOf(item)
    })),
    isPartOf: { "@id": `${siteUrl}/#website` }
  };
}

// A Featured story. Author is a real named Person — Pradip and Rimisha have
// bylines on these — which is the signal Google's guidelines weigh most for
// topics where expertise matters, Paisa and Health especially.
export function articleSchema(siteUrl, story) {
  if (!story) return null;
  const path = `/featured/${story.slug || story.id}`;

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${siteUrl}${path}#article`,
    url: `${siteUrl}${path}`,
    headline: story.title,
    description: story.description || undefined,
    datePublished: story.created_at,
    dateModified: story.updated_at || story.created_at,
    author: story.author_name
      ? { "@type": "Person", name: story.author_name }
      : { "@id": `${siteUrl}/#organization` },
    publisher: { "@id": `${siteUrl}/#organization` },
    isPartOf: { "@id": `${siteUrl}/#website` },
    inLanguage: "en-NP"
  };
}

// Renders one or more schema objects as a single script tag. Nulls are dropped
// so callers can pass a builder that declined to produce anything.
export function jsonLd(...schemas) {
  const items = schemas.filter(Boolean);
  if (!items.length) return null;
  return JSON.stringify(items.length === 1 ? items[0] : items);
}
