"use client";

import SiteNav from "../components/SiteNav";
import BattleSplit from "../components/BattleSplit";
import useScrollReveal from "../components/useScrollReveal";

export default function BattleClient({ battles = [], myVotes = {} }) {
  useScrollReveal();

  return (
    <>
      <SiteNav />

      <div className="page-hero">
        <div className="page-glow"></div>
        <div className="page-shell">
          <div className="page-head">
            <div>
              <div className="page-kicker">VOTE NOW</div>
              <h1 className="page-title">KastoChha Battle</h1>
              <p className="page-sub">Vote and Decide - Make your decision from experiences.</p>
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
          <BattleSplit battles={battles} myVotes={myVotes} />
        </div>
      </section>
    </>
  );
}
