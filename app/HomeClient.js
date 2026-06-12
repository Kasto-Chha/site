"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import NavAuth from "./components/NavAuth";
import {
  IconBook,
  IconBriefcase,
  IconChat,
  IconCheck,
  IconHome,
  IconPen,
  IconQuestion
} from "./components/icons";

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

function verdictClass(verdict) {
  if (!verdict) return "verd-ok";
  const value = verdict.toLowerCase();
  if (value.includes("ramro")) return "verd-good";
  if (value.includes("naramro")) return "verd-bad";
  return "verd-ok";
}

function delayClass(index) {
  if (index === 0) return "fi d1";
  if (index === 1) return "fi d2";
  if (index === 2) return "fi d3";
  if (index === 3) return "fi d4";
  return "fi";
}

function FeaturedIcon({ type }) {
  if (type === "home") return <IconHome className="icon" />;
  if (type === "briefcase") return <IconBriefcase className="icon" />;
  return <IconBook className="icon" />;
}

export default function HomeClient({
  snapshots = [],
  trending = [],
  popular = [],
  featured = [],
  battles = [],
  experiences = [],
  stats = []
}) {
  const verdictRef = useRef(null);
  const activeTabRef = useRef("share");
  const votedRef = useRef({});
  const battleVotedRef = useRef({});
  const loveRef = useRef({});
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      document.querySelectorAll(".fi").forEach((el) => el.classList.add("show"));
    }, 80);

    const handleKey = (event) => {
      if (event.key !== "Escape") return;
      const bg = document.getElementById("modal-bg");
      if (!bg) return;
      bg.classList.remove("open");
      document.body.style.overflow = "";
    };

    document.addEventListener("keydown", handleKey);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const submitSearch = () => {
    const input = document.getElementById("srch");
    const value = input ? input.value.trim() : "";
    if (!value) return;
    router.push(`/chat?q=${encodeURIComponent(value)}`);
  };

  const handleSearchKey = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitSearch();
  };

  const fillSearch = (text, el) => {
    const input = document.getElementById("srch");
    if (input) {
      input.value = text;
      input.focus();
    }
    document.querySelectorAll(".chip").forEach((chip) => chip.classList.remove("active"));
    if (el) {
      el.classList.add("active");
    }
  };

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

  const castLove = async (id) => {
    if (loveRef.current[id]) return;
    loveRef.current[id] = true;

    const loveEl = document.getElementById(`exp-${id}-love`);
    const current = Number(loveEl?.dataset.count || loveEl?.textContent || 0);
    const next = current + 1;
    if (loveEl) {
      loveEl.textContent = next.toLocaleString("en-US");
      loveEl.dataset.count = String(next);
    }

    try {
      const response = await fetch("/api/votes/experience-love", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id })
      });

      if (response.status === 401) {
        window.location.href = "/sign-in";
        return;
      }

      if (!response.ok) return;

      const payload = await response.json();
      if (!payload?.experience) return;
      const updatedLove = payload.experience.love_count || 0;
      if (loveEl) {
        loveEl.textContent = updatedLove.toLocaleString("en-US");
        loveEl.dataset.count = String(updatedLove);
      }
    } catch (error) {
      // Ignore network errors.
    }
  };

  const openModal = (tab) => {
    const bg = document.getElementById("modal-bg");
    if (!bg) return;
    bg.classList.add("open");
    document.body.style.overflow = "hidden";
    switchMTab(tab);
  };

  const closeModal = () => {
    const bg = document.getElementById("modal-bg");
    if (!bg) return;
    bg.classList.remove("open");
    document.body.style.overflow = "";
  };

  const closeBg = (event) => {
    if (event.target.id === "modal-bg") {
      closeModal();
    }
  };

  const switchMTab = (tab) => {
    activeTabRef.current = tab;
    ["share", "ask"].forEach((key) => {
      const tabBtn = document.getElementById(`tab-${key}`);
      const panel = document.getElementById(`mp-${key}`);
      if (tabBtn) tabBtn.classList.toggle("on", key === tab);
      if (panel) panel.classList.toggle("on", key === tab);
      const success = document.getElementById(`suc-${key}`);
      if (success) success.style.display = "none";
      if (panel) panel.style.display = "";
    });
    const tabs = document.querySelector(".modal-tabs");
    if (tabs) tabs.style.opacity = "1";
  };

  const pickV = (verdict) => {
    verdictRef.current = verdict;
    ["vr", "vt", "vn"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove("on");
    });
    const map = { ramro: "vr", thikai: "vt", naramro: "vn" };
    const target = document.getElementById(map[verdict]);
    if (target) target.classList.add("on");
    calcProg();
  };

  const toggleT = (el) => {
    if (!el) return;
    el.classList.toggle("on");
    calcProg();
  };

  const calcProg = () => {
    const topic = document.getElementById("sh-topic");
    const exp = document.getElementById("sh-exp");
    const tags = document.querySelectorAll(".tpill.on").length;
    const steps = [
      topic && topic.value.trim().length > 0,
      verdictRef.current !== null,
      tags > 0,
      exp && exp.value.trim().length > 10,
      false
    ];

    ["sp1", "sp2", "sp3", "sp4", "sp5"].forEach((id, index) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle("fill", steps[index]);
    });
  };

  const fillAsk = (text) => {
    const input = document.getElementById("ask-q");
    if (input) {
      input.value = text;
      input.focus();
    }
  };

  const submitForm = async (type) => {
    const panel = document.getElementById(`mp-${type}`);
    const success = document.getElementById(`suc-${type}`);
    const tabs = document.querySelector(".modal-tabs");

    if (type === "share") {
      const topic = document.getElementById("sh-topic")?.value.trim() || "";
      const body = document.getElementById("sh-exp")?.value.trim() || "";
      const verdict = verdictRef.current || "";
      const categories = Array.from(document.querySelectorAll(".tpill.on")).map((el) =>
        el.textContent.trim()
      );

      if (!topic || !body || !verdict) {
        window.alert("Please fill topic, verdict, and experience before submitting.");
        return;
      }

      const response = await fetch("/api/experiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ topic, verdict, categories, body })
      });

      if (response.status === 401) {
        window.location.href = "/sign-in";
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        window.alert(data?.error || "Failed to share experience. Please try again.");
        return;
      }
    }

    if (type === "ask") {
      const question = document.getElementById("ask-q")?.value.trim() || "";
      const category = document.getElementById("ask-cat")?.value.trim() || "";

      if (!question) {
        window.alert("Please enter a question before submitting.");
        return;
      }

      const response = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question, category })
      });

      if (response.status === 401) {
        window.location.href = "/sign-in";
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        window.alert(data?.error || "Failed to post question. Please try again.");
        return;
      }
    }

    if (panel) panel.style.display = "none";
    if (success) success.style.display = "flex";
    if (tabs) tabs.style.opacity = "0";
  };

  const resetModal = () => {
    verdictRef.current = null;
    document.querySelectorAll(".vbtn-m").forEach((btn) => btn.classList.remove("on"));
    document.querySelectorAll(".tpill").forEach((pill) => pill.classList.remove("on"));
    document.querySelectorAll(".pseg").forEach((seg) => seg.classList.remove("fill"));
    ["sh-topic", "sh-exp", "ask-q"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const shareSuccess = document.getElementById("suc-share");
    if (shareSuccess) shareSuccess.style.display = "none";
    const askSuccess = document.getElementById("suc-ask");
    if (askSuccess) askSuccess.style.display = "none";
    const sharePanel = document.getElementById("mp-share");
    if (sharePanel) sharePanel.style.display = "";
    const askPanel = document.getElementById("mp-ask");
    if (askPanel) askPanel.style.display = "";
    const tabs = document.querySelector(".modal-tabs");
    if (tabs) tabs.style.opacity = "1";
    switchMTab(activeTabRef.current);
  };

  const popularTitles = popular
    .map((topic) => topic.title)
    .filter((title) => Boolean(title));
  const trendingTitles = trending
    .map((topic) => topic.title)
    .filter((title) => Boolean(title));
  const uniqueTitles = Array.from(new Set([...popularTitles, ...trendingTitles]));
  const chipItems = uniqueTitles.slice(0, 6);
  const searchItems = uniqueTitles.slice(0, 5);
  const suggestedQuestions = uniqueTitles.slice(0, 4);

  const marqueeSource = trending.length ? trending : popular;
  const marqueeItems = marqueeSource
    .slice(0, 6)
    .map((topic) => {
      if (!topic?.title) return null;
      const totalVotes = (topic.votes_yes || 0) + (topic.votes_no || 0);
      const activity = totalVotes
        ? `${totalVotes.toLocaleString("en-US")} votes`
        : `${(topic.likes || 0).toLocaleString("en-US")} likes`;
      return `${topic.title} - ${activity}`;
    })
    .filter((label) => Boolean(label));
  const marqueeLoop = marqueeItems.length ? [...marqueeItems, ...marqueeItems] : [];

  const featuredMain = featured.find((item) => item.slot === "main");
  const featuredSide = featured.filter((item) => item.slot !== "main").slice(0, 2);

  return (
    <>
      <nav id="mainnav">
        <a href="#hero" className="logo">
          Kasto<em>Chha</em>
        </a>
        <div className="nav-links">
          <a href="/trending" className="nav-link">Trending</a>
          <a href="#snapshot" className="nav-link">Snapshot</a>
          <a href="/popular" className="nav-link">Popular</a>
          <a href="/featured" className="nav-link">Featured</a>
          <a href="/battle" className="nav-link">Battle</a>
          <a href="/experience" className="nav-link">Experience</a>
        </div>
        <div className="nav-actions">
          <button type="button" className="btn-outline" onClick={() => openModal("ask")}>
            Ask community
          </button>
          <button type="button" className="btn-red" onClick={() => openModal("share")}>
            Share a story
          </button>
          <NavAuth />
        </div>
      </nav>

      {marqueeLoop.length > 0 ? (
        <div className="marquee">
          <div className="m-track">
            {marqueeLoop.map((label, index) => (
              <span className="m-item" key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
        </div>
      ) : null}

      <section className="hero" id="hero">
        <div className="hero-glow"></div>
        <div className="kicker">
          <span className="kicker-dot"></span>
          Nepal ko real talk, seedha kura
        </div>
        <h1>
          Nepal ma sabai kura...
          <br />
          <em>KastoChha?</em>
        </h1>
        <p className="hero-sub">
          Real opinions from real people. Price, service, and long term use - no paid hype.
        </p>

        <div className="search-wrap">
          <div className="search-inner">
            <input
              id="srch"
              type="text"
              placeholder="Search anything... (e.g. phone review)"
              autoComplete="off"
              onKeyDown={handleSearchKey}
            />
            <button type="button" className="s-btn" onClick={submitSearch}>Go</button>
          </div>
        </div>

        {chipItems.length > 0 ? (
          <div className="chips-row">
            {chipItems.map((label) => (
              <button
                key={label}
                type="button"
                className="chip"
                onClick={(e) => fillSearch(label, e.currentTarget)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {searchItems.length > 0 ? (
          <div className="t-searches">
            <p>Trending searches</p>
            <ul>
              {searchItems.map((label) => (
                <li key={label}>
                  <a href={`/chat?q=${encodeURIComponent(label)}`}>{label}</a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="section section-alt" id="snapshot">
        <div className="container">
          <div className="sec-head">
            <div className="sec-head-left">
              <div className="sec-eyebrow">
                <span className="sec-tag">DAILY</span>
                <div className="sec-rule"></div>
              </div>
              <h2 className="sec-title">Daily <em>Snapshot</em></h2>
              <p className="sec-sub">Quick local signals, updated through the day</p>
            </div>
            <a href="#" className="sec-all">All widgets -&gt;</a>
          </div>

          <div className="snap-grid">
            {snapshots.length === 0 ? (
              <div className="snap-card empty-card">
                <div className="snap-title">No snapshot data yet</div>
                <p className="snap-sub">Add daily snapshot rows in Supabase to populate this section.</p>
              </div>
            ) : (
              snapshots.map((item, index) => (
                <div className={`snap-card ${delayClass(index)}`} key={item.id}>
                  <div className="snap-kicker">{item.kicker}</div>
                  <div className="snap-title">{item.title}</div>
                  <p className="snap-sub">{item.subtitle}</p>
                  <div className="snap-meta">
                    {item.meta_primary ? <span className="snap-pill">{item.meta_primary}</span> : null}
                    {item.meta_secondary ? <span className="snap-pill">{item.meta_secondary}</span> : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="section" id="trending">
        <div className="container">
          <div className="sec-head">
            <div className="sec-head-left">
              <div className="sec-eyebrow">
                <span className="sec-tag">LIVE</span>
                <div className="sec-rule"></div>
              </div>
              <h2 className="sec-title">Trending <em>KastoChha</em></h2>
              <p className="sec-sub">What Nepal is talking about right now, with real takes</p>
            </div>
            <a href="/trending" className="sec-all">View all -&gt;</a>
          </div>

          <div className="feed-list bento-grid">
            {trending.length === 0 ? (
              <div className="tr-card bento-card empty-card">
                <div className="tr-title">No trending topics yet</div>
                <div className="tr-desc">Add data in Supabase to populate this section.</div>
              </div>
            ) : (
              trending.map((topic, index) => {
                const totalVotes = (topic.votes_yes || 0) + (topic.votes_no || 0);
                const yesPct = totalVotes
                  ? Math.round(((topic.votes_yes || 0) / totalVotes) * 100)
                  : 0;
                const badgeTone = topic.badge_tone || "neutral";
                const timeLabel = formatTimeAgo(topic.created_at);

                return (
                  <div className={`tr-card bento-card ${delayClass(index)}`} key={topic.id} id={`tr-${topic.id}`}>
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
                      <button type="button" className="vbtn yes" onClick={() => castVote(topic.id, "yes")}>
                        {topic.yes_label || "Ramro"} <span className="vcnt" id={`tr-${topic.id}-y`} data-count={topic.votes_yes || 0}>{topic.votes_yes || 0}</span>
                      </button>
                      <button type="button" className="vbtn no" onClick={() => castVote(topic.id, "no")}>
                        {topic.no_label || "Naramro"} <span className="vcnt" id={`tr-${topic.id}-n`} data-count={topic.votes_no || 0}>{topic.votes_no || 0}</span>
                      </button>
                      <span className="vote-total">{totalVotes.toLocaleString("en-US")} total votes</span>
                    </div>
                    <div className="vote-bar">
                      <div className="vote-fill" id={`tr-${topic.id}-bar`} style={{ width: `${yesPct}%` }}></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="section section-alt" id="popular">
        <div className="container">
          <div className="sec-head">
            <div className="sec-head-left">
              <div className="sec-eyebrow">
                <span className="sec-tag">ALL TIME</span>
                <div className="sec-rule"></div>
              </div>
              <h2 className="sec-title">Popular <em>KastoChha</em></h2>
              <p className="sec-sub">Topics that keep pulling comments year after year</p>
            </div>
            <a href="/popular" className="sec-all">View all -&gt;</a>
          </div>

          <div className="pop-grid bento-grid">
            {popular.length === 0 ? (
              <div className="pop-card bento-card empty-card">
                <div className="pop-title">No popular topics yet</div>
                <div className="pop-stats">
                  <span className="pop-stat">Add data in Supabase to populate this section.</span>
                </div>
              </div>
            ) : (
              popular.map((topic, index) => (
                <div className={`pop-card bento-card ${delayClass(index)}`} key={topic.id}>
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

      <section className="section" id="featured">
        <div className="container">
          <div className="sec-head">
            <div className="sec-head-left">
              <div className="sec-eyebrow">
                <span className="sec-tag">EDITOR PICK</span>
                <div className="sec-rule"></div>
              </div>
              <h2 className="sec-title">Featured <em>KastoChha</em></h2>
              <p className="sec-sub">Curated stories with long threads and real receipts</p>
            </div>
          </div>

          {featured.length === 0 ? (
            <div className="bento-card empty-card" style={{ padding: "24px" }}>
              <div className="fc-title">No featured stories yet</div>
              <div className="fc-desc">Add featured stories in Supabase to populate this section.</div>
            </div>
          ) : (
            <div className="feat-grid bento-grid fi">
              {featuredMain ? (
                <div className="fc fc-main bento-card">
                  <div className="fc-visual">
                    <div className="fc-star">Editor pick</div>
                    <div className="fc-emoji"><FeaturedIcon type={featuredMain.icon} /></div>
                  </div>
                  <div className="fc-body">
                    <span className="fc-why">{featuredMain.why_text}</span>
                    <div className="fc-title">{featuredMain.title}</div>
                    <div className="fc-desc">{featuredMain.description}</div>
                    {featuredMain.link_url ? (
                      <a href={featuredMain.link_url} className="fc-read">Read full story -&gt;</a>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {featuredSide.map((story, index) => (
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

      <section className="section section-alt" id="battle">
        <div className="container">
          <div className="sec-head">
            <div className="sec-head-left">
              <div className="sec-eyebrow">
                <span className="sec-tag">VOTE NOW</span>
                <div className="sec-rule"></div>
              </div>
              <h2 className="sec-title">KastoChha <em>Battle</em></h2>
              <p className="sec-sub">Vote and decide - Nepal le decide garcha, by experience</p>
            </div>
            <a href="/battle" className="sec-all">All battles -&gt;</a>
          </div>

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
                      <button type="button" className="b-vote-btn a" onClick={() => castBattle(battle.id, "a")}>
                        {battle.left_title} ramro chha
                      </button>
                      <div className="bvs-or">or</div>
                      <button type="button" className="b-vote-btn b" onClick={() => castBattle(battle.id, "b")}>
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

      <section className="section section-deep" id="experience">
        <div className="container">
          <div className="sec-head">
            <div className="sec-head-left">
              <div className="sec-eyebrow">
                <span className="sec-tag">COMMUNITY</span>
                <div className="sec-rule"></div>
              </div>
              <h2 className="sec-title">KastoChha <em>Experience</em></h2>
              <p className="sec-sub">Real opinions from real people, city ra gaun bata</p>
            </div>
          </div>

          <div className="exp-layout bento-grid">
            <div className="wall-panel bento-card">
              <div className="wall-header">
                <div className="wall-title">KastoChha Wall</div>
                <div className="wall-sub">Latest experiences, no polishing</div>
              </div>
              <div className="wall-feed bento-grid">
                {experiences.length === 0 ? (
                  <div className="wcard bento-card empty-card">
                    <div className="wc-text">No experiences yet. Share the first one.</div>
                  </div>
                ) : (
                  experiences.map((experience, index) => (
                    <div className={`wcard bento-card ${delayClass(index)}`} key={experience.id}>
                      <div className="wcard-top">
                        <div className="av av1">{experience.author_initials}</div>
                        <div className="wc-info">
                          <div className="wc-name">{experience.author_name}</div>
                          <div className="wc-topic">{experience.topic}</div>
                        </div>
                        <div className={`wc-verdict ${verdictClass(experience.verdict)}`}>{experience.verdict}</div>
                      </div>
                      <div className="wc-text">{experience.body}</div>
                      <div className="wc-foot">
                        <button type="button" className="wc-btn" onClick={() => castLove(experience.id)}>
                          Love <span id={`exp-${experience.id}-love`} data-count={experience.love_count || 0}>{experience.love_count || 0}</span>
                        </button>
                        <button type="button" className="wc-btn">Reply</button>
                        <span className="wc-time">{formatTimeAgo(experience.created_at)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="create-panel bento-card">
              <div className="create-title">Your voice helps someone today</div>
              <div className="create-sub">Honest opinions save time, money, and wrong decisions.</div>

              <div className="cta-card ask" onClick={() => openModal("ask")}>
                <span className="cta-icon"><IconQuestion className="icon" /></span>
                <div className="cta-tag">Community Q and A</div>
                <div className="cta-heading">Ask the community</div>
                <div className="cta-desc">Kuch jannu chha? Sidha sodhnus. People share what actually happened.</div>
                <button type="button" className="cta-btn ask-btn">Ask now -&gt;</button>
              </div>

              <div className="cta-card share" onClick={() => openModal("share")}>
                <span className="cta-icon"><IconPen className="icon" /></span>
                <div className="cta-tag">Real Experiences</div>
                <div className="cta-heading">Share your experience</div>
                <div className="cta-desc">Tapai ko experience share gare aru lai maddat huncha. Cost ra timeline mention gare ramro.</div>
                <button type="button" className="cta-btn share-btn">Share now -&gt;</button>
              </div>

              {stats.length === 0 ? (
                <div className="stat-empty">
                  Add site stats in Supabase to show experience, question, and vote counts.
                </div>
              ) : (
                <div className="stat-strip">
                  {stats.map((stat) => (
                    <div className="stat-box" key={stat.id}>
                      <span className="stat-val">{stat.value}</span>
                      <div className="stat-lbl">{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="foot-inner">
          <div className="foot-grid">
            <div>
              <a href="#" className="foot-logo">Kasto<em>Chha</em></a>
              <p className="foot-tagline">Nepal ko real talk platform. Real opinions, no drama. Built for Nepalis, by Nepalis.</p>
            </div>
            <div className="foot-col">
              <h5>Explore</h5>
              <ul>
                <li><a href="/trending">Trending</a></li>
                <li><a href="/popular">Popular</a></li>
                <li><a href="/featured">Featured</a></li>
                <li><a href="/battle">Battle</a></li>
                <li><a href="/experience">Experience</a></li>
              </ul>
            </div>
            <div className="foot-col">
              <h5>Topics</h5>
              <ul>
                <li><a href="#">Technology</a></li>
                <li><a href="#">Career</a></li>
                <li><a href="#">Education</a></li>
                <li><a href="#">Housing</a></li>
                <li><a href="#">Finance</a></li>
              </ul>
            </div>
            <div className="foot-col">
              <h5>About</h5>
              <ul>
                <li><a href="#">About Us</a></li>
                <li><a href="#">Blog</a></li>
                <li><a href="#">Contact</a></li>
                <li><a href="#">Privacy Policy</a></li>
                <li><a href="#">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <span>Copyright 2025 KastoChha. Nepal ko real talk.</span>
            <span>Made with love in Kathmandu</span>
          </div>
        </div>
      </footer>

      <div className="modal-bg" id="modal-bg" onClick={closeBg}>
        <div className="modal">
          <div className="modal-head">
            <div className="modal-tabs">
              <button type="button" className="mtab on" id="tab-share" onClick={() => switchMTab("share")}>Share Experience</button>
              <button type="button" className="mtab" id="tab-ask" onClick={() => switchMTab("ask")}>Ask a Question</button>
            </div>
            <button type="button" className="modal-x" onClick={closeModal}>x</button>
          </div>

          <div className="mpanel on" id="mp-share">
            <div className="prog" style={{ marginTop: "18px" }}>
              <div className="pseg" id="sp1"></div><div className="pseg" id="sp2"></div>
              <div className="pseg" id="sp3"></div><div className="pseg" id="sp4"></div><div className="pseg" id="sp5"></div>
            </div>
            <div className="fg">
              <div className="flbl"><span className="fstep">1</span>Topic</div>
              <input className="finp" id="sh-topic" type="text" placeholder="e.g. delivery experience" onInput={calcProg} />
            </div>
            <div className="fg">
              <div className="flbl"><span className="fstep">2</span>Verdict</div>
              <div className="vgrid">
                <button type="button" className="vbtn-m ramro" id="vr" onClick={() => pickV("ramro")}>Ramro chha</button>
                <button type="button" className="vbtn-m thikai" id="vt" onClick={() => pickV("thikai")}>Thikai chha</button>
                <button type="button" className="vbtn-m naramro" id="vn" onClick={() => pickV("naramro")}>Naramro chha</button>
              </div>
            </div>
            <div className="fg">
              <div className="flbl"><span className="fstep">3</span>Category</div>
              <div className="trow">
                <button type="button" className="tpill" onClick={(e) => toggleT(e.currentTarget)}>Technology</button>
                <button type="button" className="tpill" onClick={(e) => toggleT(e.currentTarget)}>Career</button>
                <button type="button" className="tpill" onClick={(e) => toggleT(e.currentTarget)}>Food</button>
                <button type="button" className="tpill" onClick={(e) => toggleT(e.currentTarget)}>Education</button>
                <button type="button" className="tpill" onClick={(e) => toggleT(e.currentTarget)}>Finance</button>
                <button type="button" className="tpill" onClick={(e) => toggleT(e.currentTarget)}>Housing</button>
                <button type="button" className="tpill" onClick={(e) => toggleT(e.currentTarget)}>Lifestyle</button>
              </div>
            </div>
            <div className="fg">
              <div className="flbl"><span className="fstep">4</span>Your Experience</div>
              <textarea className="fta" id="sh-exp" placeholder="Tapai ko real experience share garnus. Cost, time, ra service mention gare ramro." onInput={calcProg}></textarea>
            </div>
            <div className="fg">
              <div className="flbl">
                <span className="fstep">5</span>
                Context{" "}
                <span style={{ fontSize: ".55rem", color: "var(--muted2)", marginLeft: "4px" }}>OPTIONAL</span>
              </div>
              <div className="f2col">
                <select className="fsel">
                  <option value="">Location</option>
                  <option>Kathmandu</option>
                  <option>Lalitpur</option>
                  <option>Bhaktapur</option>
                  <option>Pokhara</option>
                  <option>Other</option>
                </select>
                <select className="fsel">
                  <option value="">User Type</option>
                  <option>Student</option>
                  <option>Professional</option>
                  <option>Business Owner</option>
                  <option>Homemaker</option>
                </select>
              </div>
            </div>
            <button type="button" className="fsub" onClick={() => submitForm("share")}>
              Share Experience -&gt;
            </button>
          </div>

          <div className="mpanel" id="mp-ask">
            <div className="fg" style={{ marginTop: "18px" }}>
              <div className="flbl">Your Question</div>
              <textarea className="fta" id="ask-q" placeholder="Tapai ko question type garnus... (e.g. warranty kasto chha?)"></textarea>
              {suggestedQuestions.length > 0 ? (
                <div className="ex-chips">
                  {suggestedQuestions.map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="ex-c"
                      onClick={() => fillAsk(label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="fg">
              <div className="flbl">Category</div>
              <select className="fsel" id="ask-cat">
                <option value="">Select category...</option>
                <option>Food</option>
                <option>Career</option>
                <option>Housing</option>
                <option>Education</option>
                <option>Technology</option>
                <option>Finance</option>
                <option>Lifestyle</option>
              </select>
            </div>
            <button type="button" className="fsub" style={{ marginTop: "6px" }} onClick={() => submitForm("ask")}>
              Post Question -&gt;
            </button>
          </div>

          <div className="m-success" id="suc-share">
            <div className="msuc-ico g"><IconCheck className="icon" /></div>
            <h3>Experience Shared!</h3>
            <p>Tapai ko experience live cha.<br />Sathi haru padhdai chan. Dhanyabad!</p>
            <button type="button" className="msuc-btn" onClick={resetModal}>Share Another -&gt;</button>
          </div>
          <div className="m-success" id="suc-ask">
            <div className="msuc-ico b"><IconChat className="icon" /></div>
            <h3>Question Posted!</h3>
            <p>Tapai ko question live cha.<br />Reply aauna thap time lagna sakcha, tara aaucha.</p>
            <button type="button" className="msuc-btn" onClick={resetModal}>Ask Another -&gt;</button>
          </div>
        </div>
      </div>
    </>
  );
}
