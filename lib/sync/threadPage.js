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
  // A business's page is judged on what customers shared. Questions asked of the business are posts too, but they are
  // not experiences: counting them said "10 experiences shared" for a page with eight, and let a page with one review
  // and one question be offered to search engines (found in testing, checks E14 and J10).
  const experiences = experiencesOnly(posts);
  const card = threadShareInfo(experiences, facts.title);
  return {
    ...shareMetadata({
      type: "discussions",
      path: `/discussions/${slug}`,
      title: facts.title,
      description: experiences.length ? card.description : facts.emptyDescription,
      kicker: facts.category,
      stat: card.stat,
      kind: card.kind
    }),
    robots: robotsFor(experiences.length ? isDiscussionIndexable(experiences) : false)
  };
}

// The posts on a business's page that are someone's experience: every post except a question. One definition, used by
// the headline, the preview, the search-engine data and the rule for which pages search engines may show.
export function experiencesOnly(posts) {
  return (Array.isArray(posts) ? posts : []).filter((post) => post?.kind !== "question");
}

// The line under a thread's title: how many experiences, how many of them are replies, and, on a business's page, how
// many questions. A thread that opens with a question counts its answers, which are experiences, and has no replies
// to speak of: the question is not a post that can be replied to.
export function threadCountsLine(thread, { business = false } = {}) {
  const posts = Array.isArray(thread) ? thread : [];
  const experiences = experiencesOnly(posts).length;
  const questions = posts.length - experiences;
  const noun = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const parts = [noun(experiences, "experience", "experiences")];
  const opensWithQuestion = !business && posts[0]?.kind === "question";
  if (!opensWithQuestion && experiences > 0) parts.push(noun(experiences - 1, "reply", "replies"));
  if (business && questions > 0) parts.push(noun(questions, "question", "questions"));
  return parts.join(" \u00b7 ");
}
