"use client";

import SiteNav from "../components/SiteNav";
import TrendingCards from "../components/TrendingCards";
import useScrollReveal from "../components/useScrollReveal";

export default function TrendingClient({ topics = [], myVotes = {} }) {
  useScrollReveal();

  return (
    <>
      <SiteNav />

      <div className="page-hero">
        <div className="page-glow"></div>
        <div className="page-shell">
          <div className="page-head">
            <div>
              <div className="page-kicker">LIVE SIGNALS</div>
              <h1 className="page-title">Trending KastoChha</h1>
              <p className="page-sub">Questions, Debates, and Decisions - What Nepal is talking about right now.</p>
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
          <TrendingCards topics={topics} myVotes={myVotes} />
        </div>
      </section>
    </>
  );
}
