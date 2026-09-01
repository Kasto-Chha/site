import Image from "next/image";

import SiteNav from "../components/SiteNav";
import { getFeaturedStoriesPage } from "../../lib/supabase/queries";
import { storyHref } from "../../lib/featured";
import { breadcrumbSchema, jsonLd } from "../../lib/seo/schema";

// Featured pages are identical for every visitor — no auth() call, no
// personalisation. force-dynamic was making Next send
// "Cache-Control: private, no-store" anyway, so every crawler hit and every
// reader paid a full server render for a page that never varies.
//
// These are the pages that matter most for search, so they are the ones worth
// caching. Regenerated at most once every 5 minutes, and immediately whenever
// an article is published or edited (see revalidatePath in the admin routes).
export const revalidate = 300;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Matches the query default, so the offsets line up.
const PAGE_SIZE = 9;

function pageNumber(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  // Bounded so a crafted ?page= cannot ask for an unreasonable offset.
  return Math.min(parsed, 200);
}

export async function generateMetadata({ searchParams }) {
  const page = pageNumber(searchParams?.page);
  const suffix = page > 1 ? `, page ${page}` : "";

  return {
    title: `KastoChha Featured - In-Depth Nepal Stories & Reviews${suffix}`,
    description:
      "Deep dives, explainers, and honest reviews on the products and trends shaping everyday life in Nepal, grounded in real community experiences.",
    // Each page canonicals to itself. Pointing page 2 at page 1 would tell
    // Google the stories on it are duplicates of stories it has never seen —
    // same reasoning as /discussions.
    alternates: { canonical: page > 1 ? `/featured?page=${page}` : "/featured" },
    // Page 2 onward exists to be crawled through, not to rank: a numbered
    // slice of a list is thin by itself, same as /discussions past page 1.
    robots: page > 1 ? { index: false, follow: true } : undefined
  };
}

// Stories are curated by hand in /admin/content/featured. The "main" slot is
// the lead, shown only on page 1; everything else pages newest-first. See the
// comment on getFeaturedStoriesPage for why slot itself isn't the sort order.
// storyHref lives in lib/featured.js so this page and the homepage grid
// resolve a story's destination identically.

export default async function FeaturedPage({ searchParams }) {
  const page = pageNumber(searchParams?.page);
  const offset = (page - 1) * PAGE_SIZE;

  const { lead, rows, hasMore } = await getFeaturedStoriesPage({ offset, limit: PAGE_SIZE });
  const showLead = page === 1 && lead;

  const dateline = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const breadcrumbTrail = [{ name: "Featured", path: "/featured" }];
  if (page > 1) {
    breadcrumbTrail.push({ name: `Page ${page}`, path: `/featured?page=${page}` });
  }

  return (
    <>
      <SiteNav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema(siteUrl, breadcrumbTrail)) }}
      />

      {/* Newspaper masthead */}
      <header className="np-masthead">
        <div className="np-shell">
          <div className="np-dateline">
            <span>{dateline} · Kathmandu</span>
            <span className="np-dateline-right">Nepal&apos;s Curious Community Network</span>
          </div>
          <h1 className="np-nameplate">
            KastoChha Featured - In-Depth Stories &amp; Reviews
          </h1>
          <p className="np-motto">Not just headlines. Real stories that go beyond the surface to uncover the topics worth knowing about. Editorial opinions derived from community insights.</p>
          <div className="np-rule-double" aria-hidden="true"></div>
        </div>
      </header>

      <main className="np-main" id="main">
        <div className="np-shell">
          {!showLead && !rows.length ? (
            <div className="bento-card empty-card" style={{ padding: "24px" }}>
              <div className="fc-title">
                {page > 1 ? "No more stories" : "The newsroom is quiet"}
              </div>
              <div className="fc-desc">
                {page > 1 ? (
                  <a href="/featured">Back to the front page →</a>
                ) : (
                  "Add featured stories in the admin panel to fill the front page."
                )}
              </div>
            </div>
          ) : (
            <>
              {showLead ? (
                <article className="np-lead">
                  <a href={storyHref(lead)} className="np-lead-link">
                    {lead.image_url ? (
                      <div className="np-lead-image">
                        <Image
                          src={lead.image_url}
                          alt={lead.image_alt || lead.title}
                          fill
                          sizes="(max-width: 900px) 100vw, 900px"
                          style={{ objectFit: "cover" }}
                          priority
                        />
                      </div>
                    ) : null}
                    <div className="np-kicker">{lead.why_text || "Editor's Pick"}</div>
                    <h2 className="np-lead-headline">{lead.title}</h2>
                    {lead.description ? (
                      <p className="np-lead-summary">{lead.description}</p>
                    ) : null}
                  </a>
                </article>
              ) : null}

              {rows.length > 0 ? (
                <section className="np-more">
                  <h2 className="np-section-label np-more-label">
                    {page > 1 ? `More featured — page ${page}` : "More featured"}
                  </h2>
                  <div className="np-more-grid">
                    {rows.map((story) => (
                      <article className="np-more-cell" key={story.id}>
                        <a href={storyHref(story)}>
                          {story.image_url ? (
                            <div className="np-more-thumb">
                              <Image
                                src={story.image_url}
                                alt={story.image_alt || story.title}
                                fill
                                sizes="(max-width: 720px) 50vw, 280px"
                                style={{ objectFit: "cover" }}
                              />
                            </div>
                          ) : null}
                          {story.why_text ? (
                            <div className="np-kicker">{story.why_text}</div>
                          ) : null}
                          <h3 className="np-headline np-more-headline">{story.title}</h3>
                          {story.description ? (
                            <p className="np-summary">{story.description}</p>
                          ) : null}
                        </a>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {page > 1 || hasMore ? (
                <nav className="np-pager" aria-label="Featured pages">
                  {page > 1 ? (
                    // A crawler landing on ?page=5 needs a way back — without
                    // this, deep pages are dead ends. Same reasoning as
                    // /discussions' pager.
                    <a
                      className="btn-outline load-more"
                      href={page === 2 ? "/featured" : `/featured?page=${page - 1}`}
                    >
                      &lt;- Newer stories
                    </a>
                  ) : <span />}
                  {hasMore ? (
                    <a className="btn-outline load-more" href={`/featured?page=${page + 1}`}>
                      Older stories -&gt;
                    </a>
                  ) : <span />}
                </nav>
              ) : null}
            </>
          )}
        </div>
      </main>
    </>
  );
}
