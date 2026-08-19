import SiteNav from "../components/SiteNav";
import { getFeaturedStories } from "../../lib/supabase/queries";
import { storyHref } from "../../lib/featured";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Featured - KastoChha News",
  description:
    "Editor's picks from KastoChha — the stories, topics and threads worth your time."
};

// Stories are curated by hand in /admin/content/featured. The "main" slot is the
// lead; everything else fills the grid below. storyHref lives in lib/featured.js
// so this page and the homepage grid resolve a story's destination identically.

export default async function FeaturedPage() {
  const stories = await getFeaturedStories();

  const dateline = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const lead = stories.find((story) => story.slot === "main") || stories[0] || null;
  const rest = stories.filter((story) => story !== lead);

  return (
    <>
      <SiteNav />

      {/* Newspaper masthead */}
      <header className="np-masthead">
        <div className="np-shell">
          <div className="np-dateline">
            <span>{dateline} · Kathmandu</span>
            <span className="np-dateline-right">Nepal&apos;s Curious Community Network</span>
          </div>
          <h1 className="np-nameplate">
            Featured <em>KastoChha</em>
          </h1>
          <p className="np-motto">Editor&apos;s picks — hand-curated, updated regularly.</p>
          <div className="np-rule-double" aria-hidden="true"></div>
        </div>
      </header>

      <main className="np-main" id="main">
        <div className="np-shell">
          {!lead ? (
            <div className="bento-card empty-card" style={{ padding: "24px" }}>
              <div className="fc-title">The newsroom is quiet</div>
              <div className="fc-desc">
                Add featured stories in the admin panel to fill the front page.
              </div>
            </div>
          ) : (
            <>
              <article className="np-lead">
                <a href={storyHref(lead)} className="np-lead-link">
                  <div className="np-kicker">{lead.why_text || "Editor's Pick"}</div>
                  <h2 className="np-lead-headline">{lead.title}</h2>
                  {lead.description ? (
                    <p className="np-lead-summary">{lead.description}</p>
                  ) : null}
                </a>
              </article>

              {rest.length > 0 ? (
                <section className="np-more">
                  <h2 className="np-section-label np-more-label">More featured</h2>
                  <div className="np-more-grid">
                    {rest.map((story) => (
                      <article className="np-more-cell" key={story.id}>
                        <a href={storyHref(story)}>
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
            </>
          )}
        </div>
      </main>
    </>
  );
}
