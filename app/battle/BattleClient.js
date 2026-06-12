"use client";

import { useEffect, useRef } from "react";

import NavAuth from "../components/NavAuth";

function delayClass(index) {
  if (index === 0) return "fi d1";
  if (index === 1) return "fi d2";
  if (index === 2) return "fi d3";
  if (index === 3) return "fi d4";
  return "fi";
}

export default function BattleClient({ battles = [] }) {
  const battleVotedRef = useRef({});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      document.querySelectorAll(".fi").forEach((el) => el.classList.add("show"));
    }, 80);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const castBattle = async (id, side) => {
    if (battleVotedRef.current[id]) return;
    battleVotedRef.current[id] = side;

    const leftEl = document.getElementById(`b-${id}-av`);
    const rightEl = document.getElementById(`b-${id}-bv`);
    const left = Number(leftEl?.dataset.count || leftEl?.textContent || 0);
    const right = Number(rightEl?.dataset.count || rightEl?.textContent || 0);

    const nextLeft = left + (side === "a" ? 1 : 0);
    const nextRight = right + (side === "b" ? 1 : 0);
    const total = nextLeft + nextRight;
    const leftPct = Math.round((nextLeft / total) * 100);
    const rightPct = 100 - leftPct;

    if (leftEl) {
      leftEl.textContent = `${nextLeft.toLocaleString("en-US")} votes`;
      leftEl.dataset.count = String(nextLeft);
    }
    if (rightEl) {
      rightEl.textContent = `${nextRight.toLocaleString("en-US")} votes`;
      rightEl.dataset.count = String(nextRight);
    }

    const leftFill = document.getElementById(`b-${id}-fa`);
    const rightFill = document.getElementById(`b-${id}-fb`);
    if (leftFill) leftFill.style.width = `${leftPct}%`;
    if (rightFill) rightFill.style.width = `${rightPct}%`;
    const leftPctEl = document.getElementById(`b-${id}-apct`);
    const rightPctEl = document.getElementById(`b-${id}-bpct`);
    if (leftPctEl) leftPctEl.textContent = `${leftPct}%`;
    if (rightPctEl) rightPctEl.textContent = `${rightPct}%`;
    const totalEl = document.getElementById(`b-${id}-tot`);
    if (totalEl) totalEl.textContent = `${total.toLocaleString("en-US")} total votes`;

    try {
      const response = await fetch("/api/votes/battle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, side })
      });

      if (response.status === 401) {
        window.location.href = "/sign-in";
        return;
      }

      if (!response.ok) return;

      const payload = await response.json();
      if (!payload?.battle) return;
      const updatedLeft = payload.battle.left_votes || 0;
      const updatedRight = payload.battle.right_votes || 0;
      const updatedTotal = updatedLeft + updatedRight;
      const updatedLeftPct = updatedTotal
        ? Math.round((updatedLeft / updatedTotal) * 100)
        : 0;
      const updatedRightPct = 100 - updatedLeftPct;

      if (leftEl) {
        leftEl.textContent = `${updatedLeft.toLocaleString("en-US")} votes`;
        leftEl.dataset.count = String(updatedLeft);
      }
      if (rightEl) {
        rightEl.textContent = `${updatedRight.toLocaleString("en-US")} votes`;
        rightEl.dataset.count = String(updatedRight);
      }
      if (leftFill) leftFill.style.width = `${updatedLeftPct}%`;
      if (rightFill) rightFill.style.width = `${updatedRightPct}%`;
      if (leftPctEl) leftPctEl.textContent = `${updatedLeftPct}%`;
      if (rightPctEl) rightPctEl.textContent = `${updatedRightPct}%`;
      if (totalEl) {
        totalEl.textContent = `${updatedTotal.toLocaleString("en-US")} total votes`;
      }
    } catch (error) {
      // Ignore network errors.
    }
  };

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
              <div className="page-kicker">VOTE NOW</div>
              <h1 className="page-title">KastoChha Battle</h1>
              <p className="page-sub">Head to head debates where Nepal decides the winner.</p>
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
          <div className="battle-list bento-grid">
            {battles.length === 0 ? (
              <div className="battle-card bento-card empty-card" style={{ padding: "24px" }}>
                <div className="bs-name">No battles yet</div>
                <div className="bs-desc">Add battle rows in Supabase to start collecting votes.</div>
              </div>
            ) : (
              battles.map((battle, index) => {
                const totalVotes = (battle.left_votes || 0) + (battle.right_votes || 0);
                const leftPct = totalVotes
                  ? Math.round(((battle.left_votes || 0) / totalVotes) * 100)
                  : 0;
                const rightPct = 100 - leftPct;

                return (
                  <div className={`battle-card bento-card ${delayClass(index)}`} key={battle.id}>
                    <div className="battle-inner">
                      <div className="bside">
                        <div className="bs-cat">{battle.category}</div>
                        <div className="bs-name">{battle.left_title}</div>
                        <div className="bs-desc">{battle.left_desc}</div>
                        <div className="bs-vcnt" id={`b-${battle.id}-av`} data-count={battle.left_votes || 0}>
                          {(battle.left_votes || 0).toLocaleString("en-US")} votes
                        </div>
                      </div>
                      <div className="bvs">
                        <div className="bvs-line"></div>
                        <div className="bvs-badge">VS</div>
                        <div className="bvs-line"></div>
                      </div>
                      <div className="bside right">
                        <div className="bs-cat">{battle.category}</div>
                        <div className="bs-name">{battle.right_title}</div>
                        <div className="bs-desc">{battle.right_desc}</div>
                        <div className="bs-vcnt" id={`b-${battle.id}-bv`} data-count={battle.right_votes || 0}>
                          {(battle.right_votes || 0).toLocaleString("en-US")} votes
                        </div>
                      </div>
                    </div>
                    <div className="battle-actions">
                      <button
                        type="button"
                        className="b-vote-btn a"
                        onClick={() => castBattle(battle.id, "a")}
                      >
                        {battle.left_title} ramro chha
                      </button>
                      <div className="bvs-or">or</div>
                      <button
                        type="button"
                        className="b-vote-btn b"
                        onClick={() => castBattle(battle.id, "b")}
                      >
                        {battle.right_title} ramro chha
                      </button>
                    </div>
                    <div className="battle-result">
                      <div className="result-wrap">
                        <span className="rpct a" id={`b-${battle.id}-apct`}>{leftPct}%</span>
                        <div className="rtrack">
                          <div className="rfill-a" id={`b-${battle.id}-fa`} style={{ width: `${leftPct}%` }}></div>
                          <div className="rfill-b" id={`b-${battle.id}-fb`} style={{ width: `${rightPct}%` }}></div>
                        </div>
                        <span className="rpct b" id={`b-${battle.id}-bpct`}>{rightPct}%</span>
                      </div>
                      <div className="rtotal" id={`b-${battle.id}-tot`}>
                        {totalVotes.toLocaleString("en-US")} total votes
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </>
  );
}
