import { topicSlug } from "../slug";
import { shareMetadata, threadShareInfo } from "../share";
import { isDiscussionIndexable, robotsFor } from "../seo/indexable";
import { googleLink } from "./validate";
import { kindDisplay } from "./businessTypes";
import { merchantTitle } from "./slug";

// What the thread page needs to know about a business, as plain functions so it can be
// tested without rendering. Pure.

// A title made from a slug: "himal-brew-house-jhamsikhel" -> "himal brew house jhamsikhel".
// Plain, and it makes the same slug again, which is the only thing it is for.
export function slugToTitle(slug) {
  return (slug ?? "").toString().replace(/-+/g, " ").trim();
}

// The title a post must be sent under to land in this thread: the stored one if it makes the
// thread's slug, otherwise one made from the slug itself. A post sent under any title that
// makes a different slug would start a second thread, so this never trusts a title blindly.
export function pinnedTitleFor({ title, slug }) {
  const stored = (title ?? "").toString().trim();
  if (stored && topicSlug(stored) === slug) return stored;
  return slugToTitle(slug);
}

export function pinnedTitle(merchant) {
  return pinnedTitleFor({ title: merchant && merchant.thread_title, slug: merchant && merchant.topic_slug });
}

// A link that is safe to put on a button: Google's own, or nothing.
export function safeGoogleLink(url) {
  return googleLink(url) || "";
}

function clip(text, max) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}\u2026`;
}

// The title, description and facts the page and its share card use for a business thread.
// A thread with posts keeps its usual description (built by the caller from the posts);
// one with none is described by the business itself.
export function businessPageFacts(merchant) {
  const name = merchant.business_name;
  const area = merchant.area;
  const kindName = kindDisplay(merchant.business_kind, merchant.kind_label);
  const about = (merchant.about || "").toString().trim();
  const emptyDescription = about
    ? clip(`${name}, ${area}. ${about}`, 200)
    : `${kindName} in ${area}. Nobody has shared an experience here yet: be the first to tell Nepal what it is really like.`;
  return {
    name,
    area,
    kindName,
    category: merchant.category,
    about,
    title: merchantTitle(merchant),
    reviewUrl: safeGoogleLink(merchant.google_review_url),
    mapsUrl: safeGoogleLink(merchant.google_maps_url),
    emptyDescription
  };
}

// The page's search and share information for a business thread. A thread with posts is
// described by its posts and indexed on the same rule as any other; one with none is
// described by the business itself and kept out of search engines until it has some.
export function businessMetadata({ slug, merchant, thread }) {
  const facts = businessPageFacts(merchant);
  const posts = Array.isArray(thread) ? thread : [];
  const card = threadShareInfo(posts, facts.title);
  return {
    ...shareMetadata({
      type: "discussions",
      path: `/discussions/${slug}`,
      title: facts.title,
      description: posts.length ? card.description : facts.emptyDescription,
      kicker: facts.category,
      stat: card.stat,
      kind: card.kind
    }),
    robots: robotsFor(posts.length ? isDiscussionIndexable(posts) : false)
  };
}
