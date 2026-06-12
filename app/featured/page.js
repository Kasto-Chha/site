import { IconBook, IconBriefcase, IconHome } from "../components/icons";
import NavAuth from "../components/NavAuth";

import { getFeaturedStories } from "../../lib/supabase/queries";

function FeaturedIcon({ type }) {
  if (type === "home") return <IconHome className="icon" />;
  if (type === "briefcase") return <IconBriefcase className="icon" />;
  return <IconBook className="icon" />;
}

export default async function FeaturedPage() {
  const stories = await getFeaturedStories();
  const mainStory = stories.find((item) => item.slot === "main");
  const sideStories = stories.filter((item) => item.slot !== "main").slice(0, 2);

  return (
    <>
      <nav id="mainnav">
        <a href="/" className="logo">
          Kasto<em>Chha</em>
        </a>
        <div className="nav-links">
          <a href="/trending" className="nav-link">Trending</a>
          <a href="/popular" className="nav-link">Popular</a>
          <a href="/featured" className="nav-link">Featured</a>
          <a href="/battle" className="nav-link">Battle</a>
          <a href="/experience" className="nav-link">Experience</a>
        </div>
        <div className="nav-actions">
          <a className="btn-outline" href="/chat">Ask community</a>
          <a className="btn-red" href="/experience">Share review</a>
          <NavAuth />
        </div>
      </nav>

      <div className="page-hero">
        <div className="page-glow"></div>
        <div className="page-shell">
          <div className="page-head">
            <div>
              <div className="page-kicker">EDITOR PICK</div>
              <h1 className="page-title">Featured KastoChha</h1>
              <p className="page-sub">Curated stories with deep community insights.</p>
            </div>
            <div className="page-actions">
              <a className="btn-outline" href="/chat">Ask community</a>
              <a className="btn-red" href="/experience">Share review</a>
            </div>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="container">
          {stories.length === 0 ? (
            <div className="bento-card empty-card" style={{ padding: "24px" }}>
              <div className="fc-title">No featured stories yet</div>
              <div className="fc-desc">Add featured stories in Supabase to populate this page.</div>
            </div>
          ) : (
            <div className="feat-grid bento-grid">
              {mainStory ? (
                <div className="fc fc-main bento-card">
                  <div className="fc-visual">
                    <div className="fc-star">Editor pick</div>
                    <div className="fc-emoji"><FeaturedIcon type={mainStory.icon} /></div>
                  </div>
                  <div className="fc-body">
                    <span className="fc-why">{mainStory.why_text}</span>
                    <div className="fc-title">{mainStory.title}</div>
                    <div className="fc-desc">{mainStory.description}</div>
                    {mainStory.link_url ? (
                      <a href={mainStory.link_url} className="fc-read">Read full story -&gt;</a>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {sideStories.map((story, index) => (
                <div
                  className={`fc ${index === 0 ? "fc-b" : "fc-c"} bento-card`}
                  key={story.id}
                >
                  <div className="fc-visual">
                    <div className="fc-emoji"><FeaturedIcon type={story.icon} /></div>
                  </div>
                  <div className="fc-body">
                    <span className="fc-why">{story.why_text}</span>
                    <div className="fc-title">{story.title}</div>
                    <div className="fc-desc">{story.description}</div>
                    {story.link_url ? (
                      <a href={story.link_url} className="fc-read">Read -&gt;</a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
