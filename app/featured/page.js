import SiteNav from "../components/SiteNav";
import {
  getBattles,
  getFeaturedStories,
  getReviews,
  getTrendingTopics
} from "../../lib/supabase/queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Featured - KastoChha News",
  description:
    "The KastoChha front page: what Nepal is voting on, the newest community experiences, and the editor's picks of the day."
};

function snippet(text = "", max = 180) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
}

// Newspaper-style date label: "Today" / "Yesterday" / "Jul 12".
function newsDate(value) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((day(now) - day(date)) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// A poll's byline is its result: how many people voted and which way they lean.
function pollByline(topic) {
  const yes = topic.votes_yes || 0;
  const mid = topic.votes_mid || 0;
  const no = topic.votes_no || 0;
  const total = yes + mid + no;
  const parts = [topic.category].filter(Boolean);
  if (total) {
    parts.push(`${total.toLocaleString("en-US")} vote${total === 1 ? "" : "s"}`);
    parts.push(`${Math.round((yes / total) * 100)}% ${topic.yes_label || "Thik Chha"}`);
  } else {
    parts.push("No votes yet");
  }
  return parts.join(" · ");
}

function reviewByline(review) {
  const score = (review.upvotes || 0) - (review.downvotes || 0);
  const parts = [`By ${review.author_name || "KastoChha"}`];
  if (review.created_at) parts.push(newsDate(review.created_at));
  parts.push(`net ${score >= 0 ? "+" : ""}${score}`);
  return parts.join(" · ");
}

function battleByline(battle) {
  const total = (battle.left_votes || 0) + (battle.right_votes || 0);
  const parts = [battle.category].filter(Boolean);
  parts.push(
    total
      ? `${total.toLocaleString("en-US")} vote${total === 1 ? "" : "s"} cast`
      : "Voting open"
  );
  return parts.join(" · ");
}

function storyHref(story) {
  return story.link_url || `/featured/${story.id}`;
}

export default async function FeaturedPage() {
  const [trending, reviews, battles, stories] = await Promise.all([
    getTrendingTopics(),
    getReviews(40),
    getBattles(),
    getFeaturedStories()
  ]);

  const dateline = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // The front page is built from what the community actually produced: the
  // highest-ranked poll leads, the newest experiences run alongside it, and
  // the remaining polls and battles fill the grid below.
  const [lead, ...otherTopics] = trending;
  const secondary = reviews.slice(0, 2);
  const latest = reviews.slice(0, 7);

  const mainPick = stories.find((item) => item.slot === "main");
  const otherPicks = stories.filter((item) => item !== mainPick);
  const picks = [mainPick, ...otherPicks].filter(Boolean).slice(0, 4);

  const more = [
    ...otherTopics.map((topic) => ({
      key: `topic-${topic.id}`,
      href: `/trending/${topic.id}`,
      title: topic.title,
      summary: snippet(topic.description || "", 110),
      byline: pollByline(topic)
    })),
    ...battles.map((battle) => ({
      key: `battle-${battle.id}`,
      href: `/battle/${battle.id}`,
      image: battle.left_image || battle.right_image || "",
      title: `${battle.left_title} vs ${battle.right_title}`,
      summary: snippet(battle.left_desc || battle.right_desc || "", 110),
      byline: battleByline(battle)
    })),
    ...reviews.slice(2, 8).map((review) => ({
      key: `review-${review.id}`,
      href: `/discussions/${review.id}`,
      title: review.title,
      summary: snippet(review.summary || "", 110),
      byline: reviewByline(review)
    }))
  ];

  const isEmpty =
    trending.length === 0 &&
    reviews.length === 0 &&
    battles.length === 0 &&
    stories.length === 0;

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
          <p className="np-motto">What Nepal is voting on and talking about — updated daily.</p>
          <div className="np-rule-double" aria-hidden="true"></div>
        </div>
      </header>

      <main className="np-main" id="main">
        <div className="np-shell">
          {isEmpty ? (
            <div className="bento-card empty-card" style={{ padding: "24px" }}>
              <div className="fc-title">The newsroom is quiet</div>
              <div className="fc-desc">
                Add trending polls, battles or featured stories in the admin panel — or share an
                experience — to fill the front page.
              </div>
            </div>
          ) : (
            <>
              {/* Front page: lead + secondary on the left, picks + latest rail on the right */}
              <div className="np-front">
                <section className="np-front-left">
                  {lead ? (
                    <article className="np-lead">
                      <a href={`/trending/${lead.id}`} className="np-lead-link">
                        <div className="np-kicker">{lead.badge_label || "Top Story"}</div>
                        <h2 className="np-lead-headline">{lead.title}</h2>
                        <p className="np-lead-summary">{snippet(lead.description || "", 260)}</p>
                        <div className="np-byline">{pollByline(lead)}</div>
                      </a>
                    </article>
                  ) : (
                    mainPick && (
                      <article className="np-lead">
                        <a href={storyHref(mainPick)} className="np-lead-link">
                          <div className="np-kicker">{mainPick.why_text || "Editor's Pick"}</div>
                          <h2 className="np-lead-headline">{mainPick.title}</h2>
                          <p className="np-lead-summary">{mainPick.description}</p>
                        </a>
                      </article>
                    )
                  )}

                  {secondary.length > 0 ? (
                    <div className="np-secondary">
                      {secondary.map((review) => (
                        <article className="np-story" key={review.id}>
                          <a href={`/discussions/${review.id}`}>
                            <h3 className="np-headline">{review.title}</h3>
                            <p className="np-summary">{snippet(review.summary || "", 140)}</p>
                            <div className="np-byline">{reviewByline(review)}</div>
                          </a>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>

                <aside className="np-rail">
                  {picks.length > 0 ? (
                    <section className="np-rail-block">
                      <h2 className="np-section-label">Editor&apos;s Picks</h2>
                      <div className="np-picks">
                        {picks.map((story) => (
                          <article className="np-pick" key={story.id}>
                            <a href={storyHref(story)}>
                              {story.why_text ? (
                                <div className="np-pick-why">{story.why_text}</div>
                              ) : null}
                              <h3 className="np-pick-title">{story.title}</h3>
                              {story.description ? (
                                <p className="np-pick-desc">{story.description}</p>
                              ) : null}
                            </a>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {latest.length > 0 ? (
                    <section className="np-rail-block">
                      <h2 className="np-section-label">The Latest</h2>
                      <ol className="np-latest">
                        {latest.map((review) => (
                          <li key={review.id}>
                            <a href={`/discussions/${review.id}`} className="np-latest-item">
                              <span className="np-latest-time">{newsDate(review.created_at)}</span>
                              <span className="np-latest-title">{review.title}</span>
                            </a>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ) : null}
                </aside>
              </div>

              {more.length > 0 ? (
                <section className="np-more">
                  <h2 className="np-section-label np-more-label">More from KastoChha</h2>
                  <div className="np-more-grid">
                    {more.map((item) => (
                      <article className="np-more-cell" key={item.key}>
                        <a href={item.href}>
                          {item.image ? (
                            <div className="np-more-media">
                              <img src={item.image} alt="" loading="lazy" />
                            </div>
                          ) : null}
                          <h3 className="np-headline np-more-headline">{item.title}</h3>
                          {item.summary ? <p className="np-summary">{item.summary}</p> : null}
                          <div className="np-byline">{item.byline}</div>
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
