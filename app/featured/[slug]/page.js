import SiteNav from "../../components/SiteNav";
import SharePanel from "../../components/SharePanel";
import Image from "next/image";
import { permanentRedirect } from "next/navigation";

import {
  getFeaturedStoryById,
  getFeaturedStoryBySlug
} from "../../../lib/supabase/queries";
import { shareMetadata } from "../../../lib/share";
import { storyParagraphs } from "../../../lib/featured";
import { isFeaturedIndexable, robotsFor } from "../../../lib/seo/indexable";
import { articleSchema, breadcrumbSchema, jsonLd } from "../../../lib/seo/schema";

// Featured pages are identical for every visitor — no auth() call, no
// personalisation. force-dynamic was making Next send
// "Cache-Control: private, no-store" anyway, so every crawler hit and every
// reader paid a full server render for a page that never varies.
//
// These are the pages that matter most for search, so they are the ones worth
// caching. Regenerated at most once every 5 minutes, and immediately whenever
// an article is published or edited (see revalidatePath in the admin routes).
export const revalidate = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// This route used to be /featured/[id]. Anything shared before the slug column
// existed still points at a uuid, so resolve either shape: a uuid is looked up
// by id and then redirected to the story's slug URL, a slug is used directly.
//
// Returns { story, redirect } — redirect is true when the visitor arrived on an
// old uuid link and should be sent to the canonical slug URL.
async function resolveStory(param) {
  const raw = decodeURIComponent(param || "");

  if (!UUID_RE.test(raw)) {
    return { story: await getFeaturedStoryBySlug(raw), redirect: false };
  }

  const story = await getFeaturedStoryById(raw);
  return { story, redirect: Boolean(story?.slug) };
}

export async function generateMetadata({ params }) {
  const { story } = await resolveStory(params.slug);
  if (!story) return { title: "Story not found - KastoChha" };
  return {
    ...shareMetadata({
      type: "featured",
      // Always the slug URL, never the uuid the visitor may have arrived on.
      path: `/featured/${story.slug || story.id}`,
      title: story.title,
      description: story.description,
      kicker: story.why_text || "Featured",
      image: story.image_url,
      imageAlt: story.image_alt
    }),
    // A story that is only a card — a title, a blurb and a link somewhere else —
    // has nothing of its own to rank. Real articles clear 300 words easily.
    robots: robotsFor(isFeaturedIndexable(story))
  };
}

export default async function FeaturedPermalink({ params }) {
  const { story, redirect } = await resolveStory(params.slug);

  // 301 so an old uuid link hands its credit to the slug URL rather than
  // competing with it. permanentRedirect throws, so nothing below runs.
  if (redirect && story?.slug) permanentRedirect(`/featured/${story.slug}`);

  const paragraphs = storyParagraphs(story);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (!story) {
    return (
      <>
        <SiteNav />
        <div className="page-hero"><div className="page-shell"><h1 className="page-title">Story not found</h1>
          <p className="page-sub">It may have been removed. <a href="/featured">Browse featured →</a></p></div></div>
      </>
    );
  }

  // Article rather than DiscussionForumPosting: these are written by a named
  // person, which is the signal Google weighs most on topics where expertise
  // matters — Paisa and Health especially.
  const schema = jsonLd(
    articleSchema(siteUrl, story),
    breadcrumbSchema(siteUrl, [
      { name: "Featured", path: "/featured" },
      { name: story.title, path: `/featured/${story.slug || story.id}` }
    ])
  );

  return (
    <>
      <SiteNav />
      {schema ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schema }} />
      ) : null}
      <div className="page-hero">
        <div className="page-glow"></div>
        <div className="page-shell">
          <div className="page-head">
            <div>
              <div className="page-kicker">{story.why_text || "Featured"}</div>
              <h1 className="page-title">{story.title}</h1>
              {story.author_name ? (
                <p className="page-byline">
                  By {story.author_name}
                  {story.created_at ? (
                    <>
                      {" · "}
                      {/* Machine-readable alongside the human-readable date, so
                          the publish date is unambiguous to a crawler. */}
                      <time dateTime={new Date(story.created_at).toISOString()}>
                        {new Date(story.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "long",
                          year: "numeric"
                        })}
                      </time>
                    </>
                  ) : null}
                </p>
              ) : null}
              {story.description ? <p className="page-sub">{story.description}</p> : null}
            </div>
            <a className="sec-all" href="/featured">All featured -&gt;</a>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="permalink-single" style={{ maxWidth: 720 }}>
          <article className="bento-card story-card">
            {story.image_url ? (
              <div className="story-hero-image">
                <Image
                  src={story.image_url}
                  alt={story.image_alt || story.title}
                  fill
                  sizes="720px"
                  style={{ objectFit: "cover" }}
                  priority
                />
              </div>
            ) : null}
            <span className="fc-why">{story.why_text || "Featured"}</span>
            <h2 className="story-headline">{story.title}</h2>
            {story.description ? <p className="story-standfirst">{story.description}</p> : null}

            {/* The article itself. Stories written before the body column
                existed (or curated purely as a link out) have none, so the
                page falls back to pointing at wherever they do live. */}
            {paragraphs.length > 0 ? (
              <div className="story-body">
                {paragraphs.map((block, index) => {
                  if (block.type === "heading") {
                    // A dynamic tag name ("h2"/"h3"/"h4") is valid JSX —
                    // compiles to createElement(HeadingTag, ...) same as any
                    // other element. dangerouslySetInnerHTML is safe here
                    // specifically because block.html was already built by
                    // escapeHtml + renderInline in lib/featured.js, never
                    // from this raw text directly.
                    const HeadingTag = `h${block.level}`;
                    return (
                      <HeadingTag
                        key={index}
                        className={`story-subhead story-h${block.level}`}
                        dangerouslySetInnerHTML={{ __html: block.html }}
                      />
                    );
                  }
                  if (block.type === "list") {
                    return (
                      <ul key={index} className="story-list">
                        {block.items.map((item, itemIndex) => (
                          <li key={itemIndex} dangerouslySetInnerHTML={{ __html: item }} />
                        ))}
                      </ul>
                    );
                  }
                  return <p key={index} dangerouslySetInnerHTML={{ __html: block.html }} />;
                })}
              </div>
            ) : (
              <p className="story-empty">
                This story is a pointer rather than a post
                {story.link_url ? " — the full piece lives off KastoChha." : "."}
              </p>
            )}

            {story.link_url ? (
              <a className="fc-read" href={story.link_url}>Read full story -&gt;</a>
            ) : null}
          </article>
          <SharePanel
            url={`/featured/${story.slug || story.id}`}
            text={story.title}
            heading="Share this story"
          />
        </div>
      </section>
    </>
  );
}
