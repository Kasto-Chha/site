"use client";

import { useEffect, useRef } from "react";

import NavAuth from "../components/NavAuth";

function formatTimeAgo(value) {
  if (!value) return "";
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function delayClass(index) {
  if (index === 0) return "fi d1";
  if (index === 1) return "fi d2";
  if (index === 2) return "fi d3";
  if (index === 3) return "fi d4";
  return "fi";
}

export default function TrendingClient({ topics = [] }) {
  const votedRef = useRef({});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      document.querySelectorAll(".fi").forEach((el) => el.classList.add("show"));
    }, 80);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const castVote = async (id, side) => {
    if (votedRef.current[id]) return;
    votedRef.current[id] = side;

    const yesEl = document.getElementById(`tr-${id}-y`);
    const noEl = document.getElementById(`tr-${id}-n`);
    const yes = Number(yesEl?.dataset.count || yesEl?.textContent || 0);
    const no = Number(noEl?.dataset.count || noEl?.textContent || 0);

    const nextYes = yes + (side === "yes" ? 1 : 0);
    const nextNo = no + (side === "no" ? 1 : 0);

    if (yesEl) {
      yesEl.textContent = nextYes.toLocaleString("en-US");
      yesEl.dataset.count = String(nextYes);
    }
    if (noEl) {
      noEl.textContent = nextNo.toLocaleString("en-US");
      noEl.dataset.count = String(nextNo);
    }

    const pct = Math.round((nextYes / (nextYes + nextNo)) * 100);
    const bar = document.getElementById(`tr-${id}-bar`);
    if (bar) bar.style.width = `${pct}%`;

    const card = document.getElementById(`tr-${id}`);
    if (card) {
      const yesBtn = card.querySelector(".vbtn.yes");
      const noBtn = card.querySelector(".vbtn.no");
      if (yesBtn) yesBtn.classList.toggle("voted", side === "yes");
      if (noBtn) noBtn.classList.toggle("voted", side === "no");
      const totalEl = card.querySelector(".vote-total");
      if (totalEl) {
        totalEl.textContent = `${(nextYes + nextNo).toLocaleString("en-US")} total votes`;
      }
    }

    try {
      const response = await fetch("/api/votes/trending", {
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
      if (!payload?.topic) return;

      const updatedYes = payload.topic.votes_yes || 0;
      const updatedNo = payload.topic.votes_no || 0;
      if (yesEl) {
        yesEl.textContent = updatedYes.toLocaleString("en-US");
        yesEl.dataset.count = String(updatedYes);
      }
      if (noEl) {
        noEl.textContent = updatedNo.toLocaleString("en-US");
        noEl.dataset.count = String(updatedNo);
      }
      const updatedPct = Math.round((updatedYes / (updatedYes + updatedNo)) * 100);
      if (bar) bar.style.width = `${updatedPct}%`;
      if (card) {
        const totalEl = card.querySelector(".vote-total");
        if (totalEl) {
          totalEl.textContent = `${(updatedYes + updatedNo).toLocaleString("en-US")} total votes`;
        }
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
              <div className="page-kicker">LIVE SIGNALS</div>
              <h1 className="page-title">Trending KastoChha</h1>
              <p className="page-sub">Real-time topics and spikes across Nepal.</p>
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
          <div className="feed-list bento-grid">
            {topics.length === 0 ? (
              <div className="tr-card bento-card empty-card">
                <div className="tr-title">No trending topics yet</div>
                <div className="tr-desc">Add topics in Supabase to populate this page.</div>
              </div>
            ) : (
              topics.map((topic, index) => {
                const totalVotes = (topic.votes_yes || 0) + (topic.votes_no || 0);
                const yesPct = totalVotes
                  ? Math.round(((topic.votes_yes || 0) / totalVotes) * 100)
                  : 0;
                const badgeTone = topic.badge_tone || "neutral";
                const timeLabel = formatTimeAgo(topic.created_at);

                return (
                  <div
                    className={`tr-card bento-card ${delayClass(index)}`}
                    key={topic.id}
                    id={`tr-${topic.id}`}
                  >
                    <div className="tr-rank">{String(topic.rank || index + 1).padStart(2, "0")}</div>
                    <div className="tr-num">
                      <span>{String(topic.rank || index + 1).padStart(2, "0")}</span>
                      <span>{topic.category}</span>
                      {topic.trend_note ? (
                        <span className={topic.trend_note.includes("down") ? "growth down" : "growth"}>
                          {topic.trend_note}
                        </span>
                      ) : null}
                    </div>
                    <div className="tr-title">{topic.title}</div>
                    <div className="tr-desc">{topic.description}</div>
                    <div className="tr-footer">
                      {topic.badge_label ? (
                        <span className={`badge badge-${badgeTone}`}>{topic.badge_label}</span>
                      ) : null}
                      <span className="badge badge-neutral">{topic.category}</span>
                      <div className="tr-meta">
                        <span>{(topic.likes || 0).toLocaleString("en-US")} likes</span>
                        <span>{(topic.comments || 0).toLocaleString("en-US")} comments</span>
                        {timeLabel ? <span>{timeLabel}</span> : null}
                      </div>
                    </div>
                    <div className="vote-row">
                      <button
                        type="button"
                        className="vbtn yes"
                        onClick={() => castVote(topic.id, "yes")}
                      >
                        {topic.yes_label || "Ramro"}{" "}
                        <span
                          className="vcnt"
                          id={`tr-${topic.id}-y`}
                          data-count={topic.votes_yes || 0}
                        >
                          {topic.votes_yes || 0}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="vbtn no"
                        onClick={() => castVote(topic.id, "no")}
                      >
                        {topic.no_label || "Naramro"}{" "}
                        <span
                          className="vcnt"
                          id={`tr-${topic.id}-n`}
                          data-count={topic.votes_no || 0}
                        >
                          {topic.votes_no || 0}
                        </span>
                      </button>
                      <span className="vote-total">{totalVotes.toLocaleString("en-US")} total votes</span>
                    </div>
                    <div className="vote-bar">
                      <div
                        className="vote-fill"
                        id={`tr-${topic.id}-bar`}
                        style={{ width: `${yesPct}%` }}
                      ></div>
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
