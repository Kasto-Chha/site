import NavAuth from "../components/NavAuth";

import { getPopularTopics } from "../../lib/supabase/queries";

export default async function PopularPage() {
  const topics = await getPopularTopics();

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
              <div className="page-kicker">ALL TIME</div>
              <h1 className="page-title">Popular KastoChha</h1>
              <p className="page-sub">Most engaged topics of all time, ranked by community activity.</p>
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
          <div className="pop-grid bento-grid">
            {topics.length === 0 ? (
              <div className="pop-card bento-card empty-card">
                <div className="pop-title">No popular topics yet</div>
                <div className="pop-stats">
                  <span className="pop-stat">Add topics in Supabase to populate this page.</span>
                </div>
              </div>
            ) : (
              topics.map((topic, index) => (
                <div className="pop-card bento-card" key={topic.id}>
                  <div className={`pop-rank ${topic.rank <= 3 ? "hot" : ""}`}>
                    {String(topic.rank || index + 1).padStart(2, "0")}
                  </div>
                  <div className="pop-body">
                    <div className="pop-cat">{topic.category}</div>
                    <div className="pop-title">{topic.title}</div>
                    <div className="pop-stats">
                      <span className="pop-stat">{(topic.likes || 0).toLocaleString("en-US")} likes</span>
                      <span className="pop-stat">{(topic.comments || 0).toLocaleString("en-US")} comments</span>
                      {topic.sentiment_label ? (
                        <span
                          className="pop-stat"
                          style={{ color: `var(--${topic.sentiment_tone || "muted2"})` }}
                        >
                          {topic.sentiment_label}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </>
  );
}
