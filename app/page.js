"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  IconBook,
  IconBriefcase,
  IconChat,
  IconCheck,
  IconHome,
  IconPen,
  IconQuestion
} from "./components/icons";

export default function HomePage() {
  const verdictRef = useRef(null);
  const activeTabRef = useRef("share");
  const votedRef = useRef({});
  const battleVotedRef = useRef({});
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

  const castVote = (id, side, yesStart, noStart) => {
    if (votedRef.current[id]) return;
    votedRef.current[id] = side;

    let yes = yesStart;
    let no = noStart;
    if (side === "yes") {
      yes += 1;
    } else {
      no += 1;
    }

    const yesEl = document.getElementById(`${id}-y`);
    if (yesEl) yesEl.textContent = yes.toLocaleString("en-US");
    const noEl = document.getElementById(`${id}-n`);
    if (noEl) noEl.textContent = no.toLocaleString("en-US");

    const pct = Math.round((yes / (yes + no)) * 100);
    const bar = document.getElementById(`${id}-bar`);
    if (bar) bar.style.width = `${pct}%`;

    const card = document.getElementById(id);
    if (card) {
      const yesBtn = card.querySelector(".vbtn.yes");
      const noBtn = card.querySelector(".vbtn.no");
      if (yesBtn) yesBtn.classList.toggle("voted", side === "yes");
      if (noBtn) noBtn.classList.toggle("voted", side === "no");
      const totalEl = card.querySelector(".vote-total");
      if (totalEl) totalEl.textContent = `${(yes + no).toLocaleString("en-US")} total votes`;
    }
  };

  const castBattle = (id, aStart, bStart, side) => {
    if (battleVotedRef.current[id]) return;
    battleVotedRef.current[id] = side;

    let a = aStart;
    let b = bStart;
    if (side === "a") {
      a += 1;
    } else {
      b += 1;
    }

    const total = a + b;
    const aPct = Math.round((a / total) * 100);
    const bPct = 100 - aPct;

    const aFill = document.getElementById(`${id}-fa`);
    if (aFill) aFill.style.width = `${aPct}%`;
    const bFill = document.getElementById(`${id}-fb`);
    if (bFill) bFill.style.width = `${bPct}%`;
    const aPctEl = document.getElementById(`${id}-apct`);
    if (aPctEl) aPctEl.textContent = `${aPct}%`;
    const bPctEl = document.getElementById(`${id}-bpct`);
    if (bPctEl) bPctEl.textContent = `${bPct}%`;
    const totalEl = document.getElementById(`${id}-tot`);
    if (totalEl) totalEl.textContent = `${total.toLocaleString("en-US")} total votes`;

    const aVotesEl = document.getElementById(`${id}-av`);
    if (aVotesEl) aVotesEl.textContent = `${a.toLocaleString("en-US")} votes`;
    const bVotesEl = document.getElementById(`${id}-bv`);
    if (bVotesEl) bVotesEl.textContent = `${b.toLocaleString("en-US")} votes`;
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

  const submitForm = (type) => {
    const panel = document.getElementById(`mp-${type}`);
    if (panel) panel.style.display = "none";
    const success = document.getElementById(`suc-${type}`);
    if (success) success.style.display = "flex";
    const tabs = document.querySelector(".modal-tabs");
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
            Ask
          </button>
          <button type="button" className="btn-red" onClick={() => openModal("share")}>
            Share Experience
          </button>
        </div>
      </nav>

      <div className="marquee">
        <div className="m-track">
          <span className="m-item">Hot iPhone 17 - 2.4k opinions</span>
          <span className="m-item">Live Pathao vs InDrive - battle on</span>
          <span className="m-item">SLC Pariksha - rising fast</span>
          <span className="m-item">Daraz Nepal - 1.8k reviews</span>
          <span className="m-item">+2 Science vs Commerce - debated</span>
          <span className="m-item">Kathmandu Rent - 3.1k reactions</span>
          <span className="m-item">Hot iPhone 17 - 2.4k opinions</span>
          <span className="m-item">Live Pathao vs InDrive - battle on</span>
          <span className="m-item">SLC Pariksha - rising fast</span>
          <span className="m-item">Daraz Nepal - 1.8k reviews</span>
          <span className="m-item">+2 Science vs Commerce - debated</span>
          <span className="m-item">Kathmandu Rent - 3.1k reactions</span>
        </div>
      </div>

      <section className="hero" id="hero">
        <div className="hero-glow"></div>
        <div className="kicker">
          <span className="kicker-dot"></span>
          Nepal ko Real Talk Platform
        </div>
        <h1>
          Nepal ma sabai kura...
          <br />
          <em>KastoChha?</em>
        </h1>
        <p className="hero-sub">
          Authentic opinions, real experiences, honest answers - no filter, no sponsored posts.
        </p>

        <div className="search-wrap">
          <div className="search-inner">
            <input
              id="srch"
              type="text"
              placeholder="Search anything... (e.g. iPhone kasto chha?)"
              autoComplete="off"
              onKeyDown={handleSearchKey}
            />
            <button type="button" className="s-btn" onClick={submitSearch}>Go</button>
          </div>
        </div>

        <div className="chips-row">
          <button
            type="button"
            className="chip"
            onClick={(e) => fillSearch("iPhone 17", e.currentTarget)}
          >
            iPhone 17
          </button>
          <button
            type="button"
            className="chip"
            onClick={(e) => fillSearch("Pathao Job", e.currentTarget)}
          >
            Pathao Job
          </button>
          <button
            type="button"
            className="chip"
            onClick={(e) => fillSearch("+2 Science", e.currentTarget)}
          >
            +2 Science
          </button>
          <button
            type="button"
            className="chip"
            onClick={(e) => fillSearch("Kathmandu Hostel", e.currentTarget)}
          >
            Kathmandu Hostel
          </button>
          <button
            type="button"
            className="chip"
            onClick={(e) => fillSearch("eSewa vs Khalti", e.currentTarget)}
          >
            eSewa vs Khalti
          </button>
          <button
            type="button"
            className="chip"
            onClick={(e) => fillSearch("Daraz Nepal", e.currentTarget)}
          >
            Daraz Nepal
          </button>
        </div>

        <div className="t-searches">
          <p>Trending searches</p>
          <ul>
            <li><a href="#">MBA Nepal</a></li>
            <li><a href="#">Civil Service Prep</a></li>
            <li><a href="#">Freelancing Nepal</a></li>
            <li><a href="#">Kathmandu rent 2025</a></li>
            <li><a href="#">TU vs KU</a></li>
          </ul>
        </div>
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
              <p className="sec-sub">Quick signals inspired by local info hubs</p>
            </div>
            <a href="#" className="sec-all">All widgets -&gt;</a>
          </div>

          <div className="snap-grid">
            <div className="snap-card fi d1">
              <div className="snap-kicker">Weather</div>
              <div className="snap-title">Kathmandu 23C / 31C</div>
              <p className="snap-sub">Warm afternoon with light haze.</p>
              <div className="snap-meta">
                <span className="snap-pill">Updated May 20, 2026</span>
                <span className="snap-pill">Valley index: 62</span>
              </div>
            </div>
            <div className="snap-card fi d2">
              <div className="snap-kicker">Gold and Silver</div>
              <div className="snap-title">Gold 286,400 NPR</div>
              <p className="snap-sub">Silver 4,980 NPR per tola.</p>
              <div className="snap-meta">
                <span className="snap-pill">Local market estimate</span>
                <span className="snap-pill">Updated today</span>
              </div>
            </div>
            <div className="snap-card fi d3">
              <div className="snap-kicker">Fuel</div>
              <div className="snap-title">Petrol 211.50 / Diesel 199.50</div>
              <p className="snap-sub">Retail average across major stations.</p>
              <div className="snap-meta">
                <span className="snap-pill">NOC list</span>
                <span className="snap-pill">Updated today</span>
              </div>
            </div>
            <div className="snap-card fi d4">
              <div className="snap-kicker">Forex</div>
              <div className="snap-title">USD 154.20 / EUR 177.40</div>
              <p className="snap-sub">Reference rates in NPR.</p>
              <div className="snap-meta">
                <span className="snap-pill">NRB benchmark</span>
                <span className="snap-pill">Daily update</span>
              </div>
            </div>
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
              <p className="sec-sub">What Nepal is talking about right now</p>
            </div>
            <a href="/trending" className="sec-all">View all -&gt;</a>
          </div>

          <div className="feed-list bento-grid">
            <div className="tr-card bento-card fi" id="tr1">
              <div className="tr-rank">01</div>
              <div className="tr-num">
                <span>01</span>
                <span>TECHNOLOGY</span>
                <span className="growth">up 48% today</span>
              </div>
              <div className="tr-title">iPhone 17 Nepal ma kasto chha?</div>
              <div className="tr-desc">
                Price, camera quality, battery life - Nepali users ko real experiences. Daraz delivery bata kinam ki authorized dealer bata? Community le sabai angle cover gareko chha.
              </div>
              <div className="tr-footer">
                <span className="badge badge-red">Hot</span>
                <span className="badge badge-neutral">Technology</span>
                <div className="tr-meta"><span>1,247 likes</span><span>384 comments</span><span>2h ago</span></div>
              </div>
              <div className="vote-row">
                <button type="button" className="vbtn yes" onClick={() => castVote("tr1", "yes", 812, 435)}>
                  Ramro <span className="vcnt" id="tr1-y">812</span>
                </button>
                <button type="button" className="vbtn no" onClick={() => castVote("tr1", "no", 812, 435)}>
                  Naramro <span className="vcnt" id="tr1-n">435</span>
                </button>
                <span className="vote-total">1,247 total votes</span>
              </div>
              <div className="vote-bar"><div className="vote-fill" id="tr1-bar" style={{ width: "65%" }}></div></div>
            </div>

            <div className="tr-card bento-card fi d1" id="tr2">
              <div className="tr-rank">02</div>
              <div className="tr-num">
                <span>02</span>
                <span>CAREER</span>
                <span className="growth">up 31% today</span>
              </div>
              <div className="tr-title">Pathao delivery job kasto chha?</div>
              <div className="tr-desc">
                Monthly income, working hours, insurance, bike wear - Pathao rider hunu ramro decision ho? Real riders le share gareko honest opinions.
              </div>
              <div className="tr-footer">
                <span className="badge badge-gold">Rising</span>
                <span className="badge badge-neutral">Career</span>
                <div className="tr-meta"><span>934 likes</span><span>211 comments</span><span>5h ago</span></div>
              </div>
              <div className="vote-row">
                <button type="button" className="vbtn yes" onClick={() => castVote("tr2", "yes", 556, 378)}>
                  Ramro <span className="vcnt" id="tr2-y">556</span>
                </button>
                <button type="button" className="vbtn no" onClick={() => castVote("tr2", "no", 556, 378)}>
                  Naramro <span className="vcnt" id="tr2-n">378</span>
                </button>
                <span className="vote-total">934 total votes</span>
              </div>
              <div className="vote-bar"><div className="vote-fill" id="tr2-bar" style={{ width: "60%" }}></div></div>
            </div>

            <div className="tr-card bento-card fi d2" id="tr3">
              <div className="tr-rank">03</div>
              <div className="tr-num">
                <span>03</span>
                <span>EDUCATION</span>
                <span className="growth">up 22% today</span>
              </div>
              <div className="tr-title">+2 Science liye pachi k garne best?</div>
              <div className="tr-desc">
                Engineering, MBBS, IT, Banking - +2 science pachi Nepal ma kun career path wise chha? Community ko honest opinions. Seniors ko real experience sunnus.
              </div>
              <div className="tr-footer">
                <span className="badge badge-green">Trending</span>
                <span className="badge badge-neutral">Education</span>
                <div className="tr-meta"><span>678 likes</span><span>167 comments</span><span>8h ago</span></div>
              </div>
              <div className="vote-row">
                <button type="button" className="vbtn yes" onClick={() => castVote("tr3", "yes", 430, 248)}>
                  Ramro <span className="vcnt" id="tr3-y">430</span>
                </button>
                <button type="button" className="vbtn no" onClick={() => castVote("tr3", "no", 430, 248)}>
                  Naramro <span className="vcnt" id="tr3-n">248</span>
                </button>
                <span className="vote-total">678 total votes</span>
              </div>
              <div className="vote-bar"><div className="vote-fill" id="tr3-bar" style={{ width: "63%" }}></div></div>
            </div>

            <div className="tr-card bento-card fi d3" id="tr4">
              <div className="tr-rank">04</div>
              <div className="tr-num">
                <span>04</span>
                <span>HOUSING</span>
                <span className="growth down">down 5% today</span>
              </div>
              <div className="tr-title">Kathmandu ma kotha bhaada kati appropriate chha?</div>
              <div className="tr-desc">
                Rent hike, location value, landlord behavior - Valley ma thik bhaada kati ho? Tenants ra landlords duitai ko perspectives.
              </div>
              <div className="tr-footer">
                <span className="badge badge-neutral">Housing</span>
                <div className="tr-meta"><span>521 likes</span><span>142 comments</span><span>12h ago</span></div>
              </div>
              <div className="vote-row">
                <button type="button" className="vbtn yes" onClick={() => castVote("tr4", "yes", 295, 226)}>
                  Theek chha <span className="vcnt" id="tr4-y">295</span>
                </button>
                <button type="button" className="vbtn no" onClick={() => castVote("tr4", "no", 295, 226)}>
                  Mahango <span className="vcnt" id="tr4-n">226</span>
                </button>
                <span className="vote-total">521 total votes</span>
              </div>
              <div className="vote-bar"><div className="vote-fill" id="tr4-bar" style={{ width: "57%" }}></div></div>
            </div>
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
              <p className="sec-sub">Most engaged topics of all time</p>
            </div>
            <a href="/popular" className="sec-all">View all -&gt;</a>
          </div>

          <div className="pop-grid bento-grid">
            <div className="pop-card bento-card fi">
              <div className="pop-rank hot">01</div>
              <div className="pop-body">
                <div className="pop-cat">Technology</div>
                <div className="pop-title">Daraz Nepal delivery experience kasto chha?</div>
                <div className="pop-stats">
                  <span className="pop-stat">3.1k likes</span>
                  <span className="pop-stat">847 comments</span>
                  <span className="pop-stat" style={{ color: "var(--green)" }}>78% positive</span>
                </div>
              </div>
            </div>
            <div className="pop-card bento-card fi d1">
              <div className="pop-rank hot">02</div>
              <div className="pop-body">
                <div className="pop-cat">Finance</div>
                <div className="pop-title">eSewa vs Khalti - kun digital wallet better chha?</div>
                <div className="pop-stats">
                  <span className="pop-stat">2.8k likes</span>
                  <span className="pop-stat">612 comments</span>
                  <span className="pop-stat" style={{ color: "var(--green)" }}>65% positive</span>
                </div>
              </div>
            </div>
            <div className="pop-card bento-card fi d2">
              <div className="pop-rank hot">03</div>
              <div className="pop-body">
                <div className="pop-cat">Lifestyle</div>
                <div className="pop-title">Kathmandu food delivery - Foodmandu vs Bhoj?</div>
                <div className="pop-stats">
                  <span className="pop-stat">2.2k likes</span>
                  <span className="pop-stat">498 comments</span>
                  <span className="pop-stat" style={{ color: "var(--green)" }}>58% positive</span>
                </div>
              </div>
            </div>
            <div className="pop-card bento-card fi d3">
              <div className="pop-rank">04</div>
              <div className="pop-body">
                <div className="pop-cat">Education</div>
                <div className="pop-title">Tribhuvan University education quality kasto chha?</div>
                <div className="pop-stats">
                  <span className="pop-stat">1.9k likes</span>
                  <span className="pop-stat">441 comments</span>
                  <span className="pop-stat" style={{ color: "var(--gold)" }}>44% positive</span>
                </div>
              </div>
            </div>
            <div className="pop-card bento-card fi d4">
              <div className="pop-rank">05</div>
              <div className="pop-body">
                <div className="pop-cat">Career</div>
                <div className="pop-title">Nepal Civil Service preparation worth chha ki hoina?</div>
                <div className="pop-stats">
                  <span className="pop-stat">1.7k likes</span>
                  <span className="pop-stat">389 comments</span>
                  <span className="pop-stat" style={{ color: "var(--gold)" }}>37% positive</span>
                </div>
              </div>
            </div>
            <div className="pop-card bento-card fi" style={{ transitionDelay: ".32s" }}>
              <div className="pop-rank">06</div>
              <div className="pop-body">
                <div className="pop-cat">Housing</div>
                <div className="pop-title">Bhaktapur vs Lalitpur - kun place better for living?</div>
                <div className="pop-stats">
                  <span className="pop-stat">1.4k likes</span>
                  <span className="pop-stat">312 comments</span>
                  <span className="pop-stat" style={{ color: "var(--muted2)" }}>Stable</span>
                </div>
              </div>
            </div>
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
              <p className="sec-sub">Curated stories worth your attention</p>
            </div>
          </div>

          <div className="feat-grid bento-grid fi">
            <div className="fc fc-main bento-card">
              <div className="fc-visual">
                <div className="fc-star">Editor pick</div>
                <div className="fc-emoji"><IconBook className="icon" /></div>
              </div>
              <div className="fc-body">
                <span className="fc-why">Why featured - Deep community analysis</span>
                <div className="fc-title">Nepal ma MBA garnu worth chha? 200+ graduates ko opinions</div>
                <div className="fc-desc">
                  Salary expectations, job market reality, college quality, ROI - MBA garnu thik chha ki time waste? Pokhara University, KU, TU bata graduates le share gareko real data ra experiences.
                </div>
                <a href="#" className="fc-read">Read full story -&gt;</a>
              </div>
            </div>
            <div className="fc fc-b bento-card">
              <div className="fc-visual">
                <div className="fc-emoji"><IconHome className="icon" /></div>
              </div>
              <div className="fc-body">
                <span className="fc-why">Why featured - High impact for students</span>
                <div className="fc-title">Kathmandu hostel life kasto chha?</div>
                <div className="fc-desc">Safety, cost, food quality - 500+ students ko review bata real picture.</div>
                <a href="#" className="fc-read">Read -&gt;</a>
              </div>
            </div>
            <div className="fc fc-c bento-card">
              <div className="fc-visual">
                <div className="fc-emoji"><IconBriefcase className="icon" /></div>
              </div>
              <div className="fc-body">
                <span className="fc-why">Why featured - Trending career topic</span>
                <div className="fc-title">Nepal ma freelancing - realistic income expectations</div>
                <div className="fc-desc">Toptal, Upwork, Fiverr bata Nepali freelancers ko real income journey.</div>
                <a href="#" className="fc-read">Read -&gt;</a>
              </div>
            </div>
          </div>
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
              <p className="sec-sub">Vote and decide - Nepal le decide garcha</p>
            </div>
            <a href="/battle" className="sec-all">All battles -&gt;</a>
          </div>

          <div className="battle-list bento-grid">
            <div className="battle-card bento-card fi">
              <div className="battle-inner">
                <div className="bside">
                  <div className="bs-cat">Ride Sharing</div>
                  <div className="bs-name">Pathao</div>
                  <div className="bs-desc">Established brand, wider coverage, loyalty points program</div>
                  <div className="bs-vcnt" id="b1-av">3,847 votes</div>
                </div>
                <div className="bvs">
                  <div className="bvs-line"></div>
                  <div className="bvs-badge">VS</div>
                  <div className="bvs-line"></div>
                </div>
                <div className="bside right">
                  <div className="bs-cat">Ride Sharing</div>
                  <div className="bs-name">InDrive</div>
                  <div className="bs-desc">Price negotiation, newer platform, cheaper rates overall</div>
                  <div className="bs-vcnt" id="b1-bv">2,611 votes</div>
                </div>
              </div>
              <div className="battle-actions">
                <button type="button" className="b-vote-btn a" onClick={() => castBattle("b1", 3847, 2611, "a")}>
                  Pathao ramro chha
                </button>
                <div className="bvs-or">or</div>
                <button type="button" className="b-vote-btn b" onClick={() => castBattle("b1", 3847, 2611, "b")}>
                  InDrive ramro chha
                </button>
              </div>
              <div className="battle-result">
                <div className="result-wrap">
                  <span className="rpct a" id="b1-apct">60%</span>
                  <div className="rtrack">
                    <div className="rfill-a" id="b1-fa" style={{ width: "60%" }}></div>
                    <div className="rfill-b" id="b1-fb" style={{ width: "40%" }}></div>
                  </div>
                  <span className="rpct b" id="b1-bpct">40%</span>
                </div>
                <div className="rtotal" id="b1-tot">6,458 total votes</div>
              </div>
            </div>

            <div className="battle-card bento-card fi d1">
              <div className="battle-inner">
                <div className="bside">
                  <div className="bs-cat">Digital Wallet</div>
                  <div className="bs-name">eSewa</div>
                  <div className="bs-desc">More merchants, trusted brand, QR pay everywhere in Nepal</div>
                  <div className="bs-vcnt" id="b2-av">5,102 votes</div>
                </div>
                <div className="bvs">
                  <div className="bvs-line"></div>
                  <div className="bvs-badge">VS</div>
                  <div className="bvs-line"></div>
                </div>
                <div className="bside right">
                  <div className="bs-cat">Digital Wallet</div>
                  <div className="bs-name">Khalti</div>
                  <div className="bs-desc">Better UI, faster transfers, growing merchant base</div>
                  <div className="bs-vcnt" id="b2-bv">3,298 votes</div>
                </div>
              </div>
              <div className="battle-actions">
                <button type="button" className="b-vote-btn a" onClick={() => castBattle("b2", 5102, 3298, "a")}>
                  eSewa ramro chha
                </button>
                <div className="bvs-or">or</div>
                <button type="button" className="b-vote-btn b" onClick={() => castBattle("b2", 5102, 3298, "b")}>
                  Khalti ramro chha
                </button>
              </div>
              <div className="battle-result">
                <div className="result-wrap">
                  <span className="rpct a" id="b2-apct">61%</span>
                  <div className="rtrack">
                    <div className="rfill-a" id="b2-fa" style={{ width: "61%" }}></div>
                    <div className="rfill-b" id="b2-fb" style={{ width: "39%" }}></div>
                  </div>
                  <span className="rpct b" id="b2-bpct">39%</span>
                </div>
                <div className="rtotal" id="b2-tot">8,400 total votes</div>
              </div>
            </div>

            <div className="battle-card bento-card fi d2">
              <div className="battle-inner">
                <div className="bside">
                  <div className="bs-cat">Education</div>
                  <div className="bs-name">+2 Science</div>
                  <div className="bs-desc">Medical, engineering path, high competition, job security</div>
                  <div className="bs-vcnt" id="b3-av">4,211 votes</div>
                </div>
                <div className="bvs">
                  <div className="bvs-line"></div>
                  <div className="bvs-badge">VS</div>
                  <div className="bvs-line"></div>
                </div>
                <div className="bside right">
                  <div className="bs-cat">Education</div>
                  <div className="bs-name">+2 Commerce</div>
                  <div className="bs-desc">BBA, banking, CA path, business opportunities, flexibility</div>
                  <div className="bs-vcnt" id="b3-bv">3,189 votes</div>
                </div>
              </div>
              <div className="battle-actions">
                <button type="button" className="b-vote-btn a" onClick={() => castBattle("b3", 4211, 3189, "a")}>
                  Science ramro chha
                </button>
                <div className="bvs-or">or</div>
                <button type="button" className="b-vote-btn b" onClick={() => castBattle("b3", 4211, 3189, "b")}>
                  Commerce ramro chha
                </button>
              </div>
              <div className="battle-result">
                <div className="result-wrap">
                  <span className="rpct a" id="b3-apct">57%</span>
                  <div className="rtrack">
                    <div className="rfill-a" id="b3-fa" style={{ width: "57%" }}></div>
                    <div className="rfill-b" id="b3-fb" style={{ width: "43%" }}></div>
                  </div>
                  <span className="rpct b" id="b3-bpct">43%</span>
                </div>
                <div className="rtotal" id="b3-tot">7,400 total votes</div>
              </div>
            </div>
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
              <p className="sec-sub">Real opinions from real people across Nepal</p>
            </div>
          </div>

          <div className="exp-layout bento-grid">
            <div className="wall-panel bento-card">
              <div className="wall-header">
                <div className="wall-title">KastoChha Wall</div>
                <div className="wall-sub">Latest experiences shared by the community</div>
              </div>
              <div className="wall-feed bento-grid">
                <div className="wcard bento-card fi">
                  <div className="wcard-top">
                    <div className="av av1">RK</div>
                    <div className="wc-info">
                      <div className="wc-name">Rajesh K.</div>
                      <div className="wc-topic">iPhone 17 Nepal</div>
                    </div>
                    <div className="wc-verdict verd-good">Ramro</div>
                  </div>
                  <div className="wc-text">
                    &ldquo;Camera honestly mast chha - especially low light ma. But price Rs 1.8 lakh bhayepachi insurance ni linu parcha. Daraz bata kineko, delivery thik samayama ayo. Warranty ko laagi authorized reseller bata kine better huncha.&rdquo;
                  </div>
                  <div className="wc-foot">
                    <button type="button" className="wc-btn">Love 48</button>
                    <button type="button" className="wc-btn">Reply</button>
                    <span className="wc-time">3h ago</span>
                  </div>
                </div>

                <div className="wcard bento-card fi d1">
                  <div className="wcard-top">
                    <div className="av av2">SM</div>
                    <div className="wc-info">
                      <div className="wc-name">Sita M.</div>
                      <div className="wc-topic">Pathao Job</div>
                    </div>
                    <div className="wc-verdict verd-ok">Thikai</div>
                  </div>
                  <div className="wc-text">
                    &ldquo;Monthly Rs 35-45k earn garcha depending on hours. Rain bela garo huncha, safety gear dina parthyo. Fuel cost badeko chha so margin thoda kam chha. Side income ko laagi thik chha but main income ma depend nagarne.&rdquo;
                  </div>
                  <div className="wc-foot">
                    <button type="button" className="wc-btn">Love 31</button>
                    <button type="button" className="wc-btn">Reply</button>
                    <span className="wc-time">6h ago</span>
                  </div>
                </div>

                <div className="wcard bento-card fi d2">
                  <div className="wcard-top">
                    <div className="av av3">AP</div>
                    <div className="wc-info">
                      <div className="wc-name">Anita P.</div>
                      <div className="wc-topic">TU MBA Program</div>
                    </div>
                    <div className="wc-verdict verd-bad">Naramro</div>
                  </div>
                  <div className="wc-text">
                    &ldquo;2 years ra Rs 3 lakh invest gare. Job placement cell practically nonexistent chha. Faculty quality mixed. Private college bata MBA garnu better lagcha honestly. TU ko naam le job market ma zyada farak pardaina aajkal.&rdquo;
                  </div>
                  <div className="wc-foot">
                    <button type="button" className="wc-btn">Love 62</button>
                    <button type="button" className="wc-btn">Reply</button>
                    <span className="wc-time">1d ago</span>
                  </div>
                </div>

                <div className="wcard bento-card fi d3">
                  <div className="wcard-top">
                    <div className="av av4">BT</div>
                    <div className="wc-info">
                      <div className="wc-name">Bibek T.</div>
                      <div className="wc-topic">Kathmandu Hostel Life</div>
                    </div>
                    <div className="wc-verdict verd-ok">Thikai</div>
                  </div>
                  <div className="wc-text">
                    &ldquo;Rs 8,000-12,000 ma decent room paucha Kirtipur area ma. Wifi mostly sano speed chha. Khana ghar ko khana jasta hudaina but manage huncha. Location wise campus najik bhaye time bachcha commuting bata.&rdquo;
                  </div>
                  <div className="wc-foot">
                    <button type="button" className="wc-btn">Love 27</button>
                    <button type="button" className="wc-btn">Reply</button>
                    <span className="wc-time">2d ago</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="create-panel bento-card">
              <div className="create-title">Your Voice Matters</div>
              <div className="create-sub">Your honest opinion helps thousands of Nepalis make better decisions every day.</div>

              <div className="cta-card ask" onClick={() => openModal("ask")}>
                <span className="cta-icon"><IconQuestion className="icon" /></span>
                <div className="cta-tag">Community Q and A</div>
                <div className="cta-heading">Ask a KastoChha</div>
                <div className="cta-desc">Kuch jannu chha? Community lai sodhnus - thousands of Nepalis will answer honestly.</div>
                <button type="button" className="cta-btn ask-btn">Ask Now -&gt;</button>
              </div>

              <div className="cta-card share" onClick={() => openModal("share")}>
                <span className="cta-icon"><IconPen className="icon" /></span>
                <div className="cta-tag">Real Experiences</div>
                <div className="cta-heading">Share Your Experience</div>
                <div className="cta-desc">Tapai ko experience share gare aru lai maddat huncha. No filters, no sponsors, just truth.</div>
                <button type="button" className="cta-btn share-btn">Share Now -&gt;</button>
              </div>

              <div className="stat-strip">
                <div className="stat-box">
                  <span className="stat-val">48k</span>
                  <div className="stat-lbl">Experiences</div>
                </div>
                <div className="stat-box">
                  <span className="stat-val">12k</span>
                  <div className="stat-lbl">Questions</div>
                </div>
                <div className="stat-box">
                  <span className="stat-val">200k</span>
                  <div className="stat-lbl">Votes</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="foot-inner">
          <div className="foot-grid">
            <div>
              <a href="#" className="foot-logo">Kasto<em>Chha</em></a>
              <p className="foot-tagline">Nepal ko real talk platform. Authentic opinions, zero filter. Built for Nepalis, by Nepalis.</p>
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
              <input className="finp" id="sh-topic" type="text" placeholder="e.g. Daraz Nepal delivery experience" onInput={calcProg} />
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
              <textarea className="fta" id="sh-exp" placeholder="Tapai ko real experience share garnus... honest ra helpful hunu important chha." onInput={calcProg}></textarea>
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
              <textarea className="fta" id="ask-q" placeholder="Tapai ko question type garnus... (e.g. iPhone 17 kasto chha?)"></textarea>
              <div className="ex-chips">
                <button type="button" className="ex-c" onClick={() => fillAsk("iPhone 17 kasto chha?")}>iPhone 17 kasto chha?</button>
                <button type="button" className="ex-c" onClick={() => fillAsk("Pathao job kasto chha?")}>Pathao job kasto chha?</button>
                <button type="button" className="ex-c" onClick={() => fillAsk("+2 pachi k garne best ho?")}>+2 pachi k garne best ho?</button>
                <button type="button" className="ex-c" onClick={() => fillAsk("Kathmandu hostel life kasto chha?")}>Kathmandu hostel life kasto chha?</button>
              </div>
            </div>
            <div className="fg">
              <div className="flbl">Category</div>
              <select className="fsel">
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
            <p>Tapai ko experience live cha.<br />Community le chhadai padhcha - dhanyabad!</p>
            <button type="button" className="msuc-btn" onClick={resetModal}>Share Another -&gt;</button>
          </div>
          <div className="m-success" id="suc-ask">
            <div className="msuc-ico b"><IconChat className="icon" /></div>
            <h3>Question Posted!</h3>
            <p>Tapai ko question live cha.<br />Community le chhadai jawab dincha!</p>
            <button type="button" className="msuc-btn" onClick={resetModal}>Ask Another -&gt;</button>
          </div>
        </div>
      </div>
    </>
  );
}
