"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import SiteNav from "./components/SiteNav";
import TrendingCards from "./components/TrendingCards";
import BattleSplit from "./components/BattleSplit";
import DiscussionsGrid from "./components/DiscussionsGrid";
import ReelsRail from "./components/ReelsRail";
import ShareRow from "./components/ShareRow";
import useScrollReveal from "./components/useScrollReveal";
import useTypedPlaceholder from "./components/useTypedPlaceholder";
import {
  IconBook,
  IconBriefcase,
  IconCheck,
  IconChat,
  IconHome
} from "./components/icons";
import { CATEGORY_LABELS } from "../lib/categories";
import { CHANNELS, SOCIALS, liveLinks, youtubeChannelUrl } from "../lib/channels";
import { storyHref } from "../lib/featured";

// Typed one at a time into the hero search bar, so the first thing a visitor
// sees is the shape of a real query. Module scope keeps the array identity
// stable across renders.
const SEARCH_EXAMPLES = ["iPhone 17", "BYD ko Atto 3", "MacBook Air M5"];

// Maps the modal's verdict keys onto the canonical labels the reviews/Experience
// feed groups and colours by.
const VERDICT_LABELS = {
  ramro: "Ramro chha",
  thikai: "Thikai chha",
  naramro: "Naramro chha"
};

// Channel/social hrefs live in lib/channels.js so the footer, the Reels rail
// and anything added later share one list. Rows without a url are dropped
// rather than shipped as a link to a platform's homepage.
const asFooterLinks = (items) =>
  liveLinks(items).map((item) => ({
    label: item.label,
    href: item.url,
    external: true
  }));

const FOOTER_COLUMNS = [
  {
    title: "Explore",
    links: [
      { label: "Answer Engine", href: "/chat" },
      { label: "Trending", href: "/trending" },
      { label: "Battle", href: "/battle" },
      // Discussions and Reels are homepage sections, not pages of their own —
      // these jump to the section instead of guessing at a nearby route.
      { label: "Discussion", href: "/#discussions" },
      { label: "Reels", href: "/#reels" },
      { label: "Experience", href: "/experience" },
      { label: "Featured", href: "/featured" }
    ]
  },
  { title: "Our Channels", links: asFooterLinks(CHANNELS) },
  { title: "Follow Us", links: asFooterLinks(SOCIALS) },
  {
    title: "Company",
    links: [
      { label: "About Us", href: "/about" },
      { label: "Contact Us", href: "/contact" },
      { label: "Community Guidelines", href: "/guidelines" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms", href: "/terms" }
    ]
  }
];

// Inline failure notice for the share/ask modal. A 401 also offers the way out,
// since "not signed in" is the one error the visitor can actually act on.
function ModalError({ message, signIn }) {
  if (!message) return null;
  return (
    <div className="modal-error" role="alert">
      <span>{message}</span>
      {signIn ? (
        <a className="modal-error-link" href="/sign-in">
          Sign in -&gt;
        </a>
      ) : null}
    </div>
  );
}

function FeaturedIcon({ type }) {
  if (type === "home") return <IconHome className="icon" />;
  if (type === "briefcase") return <IconBriefcase className="icon" />;
  return <IconBook className="icon" />;
}

export default function HomeClient({
  trending = [],
  featured = [],
  battles = [],
  reviews = [],
  stats = [],
  reels = [],
  questions = [],
  trendingVotes = {},
  battleVotes = {}
}) {
  const verdictRef = useRef(null);
  const activeTabRef = useRef("share");
  // Guards against a double submit; the state twin below only drives the button
  // label, and reading state inside the handler would see a stale value.
  const busyRef = useRef(false);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  // Stop the typing animation the moment there's something in the box — the
  // placeholder is hidden then, so there is nothing left to animate.
  const [hasQuery, setHasQuery] = useState(false);

  const searchPlaceholder = useTypedPlaceholder(SEARCH_EXAMPLES, {
    prefix: "Type ",
    suffix: " and find out KastoChha",
    paused: hasQuery
  });

  useScrollReveal();

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key !== "Escape") return;
      const bg = document.getElementById("modal-bg");
      if (!bg) return;
      bg.classList.remove("open");
      document.body.style.overflow = "";
    };

    document.addEventListener("keydown", handleKey);

    return () => {
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
    // Setting .value in code doesn't fire onInput, so tell the placeholder
    // animation to stand down here too.
    setHasQuery(Boolean(text.trim()));
    document.querySelectorAll(".chip").forEach((chip) => chip.classList.remove("active"));
    if (el) {
      el.classList.add("active");
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
    // An error from the other tab has nothing to say about this one.
    setModalError("");
    setNeedsSignIn(false);
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

  // One request path for both tabs. Errors are shown inline in the modal now:
  // window.alert() sat behind the modal backdrop on some mobile browsers, and a
  // 401 used to hard-navigate to /sign-in, throwing away whatever had just been
  // typed. Nothing here navigates, so a draft survives a failed submit.
  const submitForm = async (type) => {
    if (busyRef.current) return;

    const panel = document.getElementById(`mp-${type}`);
    const success = document.getElementById(`suc-${type}`);
    const tabs = document.querySelector(".modal-tabs");

    let endpoint = "";
    let payload = null;

    if (type === "share") {
      const title = document.getElementById("sh-topic")?.value.trim() || "";
      const summary = document.getElementById("sh-exp")?.value.trim() || "";
      const verdictKey = verdictRef.current || "";
      const categories = Array.from(document.querySelectorAll(".tpill.on")).map((el) =>
        el.textContent.trim()
      );

      if (!title || !summary || !verdictKey) {
        setModalError("Add a topic, a verdict, and your experience before posting.");
        return;
      }

      // Post into the same reviews pool the homepage discussions and Experience
      // page read from, so a shared story shows up alongside everyone else's.
      endpoint = "/api/reviews";
      payload = {
        title,
        category: categories[0] || "General",
        verdict: VERDICT_LABELS[verdictKey] || "",
        summary
      };
    }

    if (type === "ask") {
      const question = document.getElementById("ask-q")?.value.trim() || "";
      const category = document.getElementById("ask-cat")?.value.trim() || "";

      if (!question) {
        setModalError("Type your question before posting.");
        return;
      }

      endpoint = "/api/questions";
      payload = { question, category };
    }

    if (!endpoint) return;

    setModalError("");
    setNeedsSignIn(false);
    busyRef.current = true;
    setBusy(true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      if (response.status === 401) {
        setNeedsSignIn(true);
        setModalError("Sign in to post this — your draft stays right here.");
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setModalError(
          data?.error ||
            (type === "ask"
              ? "Could not post your question. Please try again."
              : "Could not share your experience. Please try again.")
        );
        return;
      }
    } catch {
      setModalError("Network problem — please try again.");
      return;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }

    if (panel) panel.style.display = "none";
    if (success) success.style.display = "flex";
    if (tabs) tabs.style.opacity = "0";
  };

  const resetModal = () => {
    verdictRef.current = null;
    setModalError("");
    setNeedsSignIn(false);
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

  const uniqueTitles = Array.from(
    new Set(trending.map((topic) => topic.title).filter((title) => Boolean(title)))
  );
  // Curated quick-search chips under the hero search bar.
  const chipItems = [
    "Loksewa exam kasto chha?",
    "BYD ko gaadi kasto chha?",
    "ABC Trek kasto chha?",
    "Sandar ko momo kasto chha?",
    "IPO parne chance kasto chha?"
  ];
  const searchItems = uniqueTitles.slice(0, 5);
  // Prefill chips for the Ask tab: what people have actually asked, falling
  // back to trending poll titles before any question has been posted.
  const askedQuestions = Array.from(
    new Set(questions.map((item) => item.question).filter(Boolean))
  );
  const suggestedQuestions = (
    askedQuestions.length ? askedQuestions : uniqueTitles
  ).slice(0, 4);

  const marqueeItems = trending
    .slice(0, 6)
    .map((topic) => {
      if (!topic?.title) return null;
      const totalVotes = (topic.votes_yes || 0) + (topic.votes_mid || 0) + (topic.votes_no || 0);
      const activity = totalVotes
        ? `${totalVotes.toLocaleString("en-US")} votes`
        : `${(topic.likes || 0).toLocaleString("en-US")} likes`;
      return `${topic.title} - ${activity}`;
    })
    .filter((label) => Boolean(label));
  const marqueeLoop = marqueeItems.length ? [...marqueeItems, ...marqueeItems] : [];

  // The lead falls back to the first story so a set with no row marked "main"
  // still renders a lead card instead of leaving the tall left column empty.
  // Sides are "everything except the lead", so a story marked "main" twice
  // can't drop out of the grid entirely.
  const featuredMain = featured.find((item) => item.slot === "main") || featured[0] || null;
  const featuredSide = featured.filter((item) => item !== featuredMain).slice(0, 2);
  // With fewer than three stories the fixed 2x2 template leaves visible holes,
  // so the grid falls back to a single column (1 story) or two (2 stories).
  const featCount = (featuredMain ? 1 : 0) + featuredSide.length;

  return (
    <>
      <SiteNav onShare={() => openModal("share")} />

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
          Nepal&apos;s Curious Community Network
        </div>
        <h1>
          Nepal ma sabai kura...
          <br />
          <img src="/kastochha-logo.svg" alt="KastoChha?" className="hero-logo" />
        </h1>
        <p className="hero-sub">
          From momo to mausam, gadgets to careers — real opinions, honest
          experiences, and community answers.
        </p>

        <div className="search-wrap">
          <div className="search-inner">
            <input
              id="srch"
              type="text"
              placeholder={searchPlaceholder}
              autoComplete="off"
              onKeyDown={handleSearchKey}
              onInput={(event) =>
                setHasQuery(event.currentTarget.value.trim().length > 0)
              }
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

      <section className="section" id="trending">
        <div className="container">
          <div className="sec-head">
            <div className="sec-head-left">
              <div className="sec-eyebrow">
                <div className="sec-rule"></div>
              </div>
              <h2 className="sec-title">Trending <em>KastoChha</em></h2>
              <p className="sec-sub">Questions, Debates, and Decisions - What Nepal is talking about right now.</p>
            </div>
            <a href="/trending" className="sec-all">View all -&gt;</a>
          </div>

          <TrendingCards topics={trending} myVotes={trendingVotes} />
        </div>
      </section>

      <section className="section section-alt" id="battle">
        <div className="container">
          <div className="sec-head">
            <div className="sec-head-left">
              <div className="sec-eyebrow">
                <div className="sec-rule"></div>
              </div>
              <h2 className="sec-title">KastoChha <em>Battle</em></h2>
              <p className="sec-sub">Vote and Decide - Make your decision from experiences.</p>
            </div>
            <a href="/battle" className="sec-all">All battles -&gt;</a>
          </div>

          <BattleSplit battles={battles} myVotes={battleVotes} />
        </div>
      </section>

      <section className="section section-deep" id="discussions">
        <div className="container">
          <div className="sec-head">
            <div className="sec-head-left">
              <div className="sec-eyebrow">
                <div className="sec-rule"></div>
              </div>
              <h2 className="sec-title">KastoChha <em>Discussions</em></h2>
              <p className="sec-sub">Reviews and Opinions from people across Nepal.</p>
            </div>
            <a href="/experience" className="sec-all">All discussions -&gt;</a>
          </div>

          <DiscussionsGrid reviews={reviews} limit={6} />

          <div className="join-band">
            <div className="join-intro">
              <h2 className="join-title">
                Share Your <span>KastoChha</span> Experience
              </h2>
              <p className="join-intro-desc">
                Sharing your honest experience might help thousands of Nepalis
                make better decisions every day. Whether it&apos;s a product you
                bought, a job you tried, a college you attended, or a place you
                visited — your real experience matters.
              </p>
            </div>
            <div className="join-card ask" onClick={() => openModal("ask")}>
              <div className="join-heading">Ask a KastoChha</div>
              <div className="join-desc">Ask anything about Nepal and get real answers, honest reviews, and community opinions from thousands of Nepalis.</div>
              <span className="join-go">Ask Now -&gt;</span>
            </div>
            <div className="join-card share" onClick={() => openModal("share")}>
              <div className="join-heading">Share Your Experience</div>
              <div className="join-desc">Help others make smarter decisions with your honest review, real experience, or opinion — about anything in Nepal.</div>
              <span className="join-go">Share Now -&gt;</span>
            </div>
          </div>

          {stats.length > 0 ? (
            <div className="stat-strip">
              {stats.map((stat) => (
                <div className="stat-box" key={stat.id}>
                  <span className="stat-val">{stat.value}</span>
                  <div className="stat-lbl">{stat.label}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="section" id="reels">
        <div className="container">
          <div className="sec-head">
            <div className="sec-head-left">
              <div className="sec-eyebrow">
                <div className="sec-rule"></div>
              </div>
              <h2 className="sec-title">KastoChha <em>Reels</em></h2>
              <p className="sec-sub">Explore our reels across different niche channels and stay updated.</p>
            </div>
            <a href={youtubeChannelUrl()} target="_blank" rel="noopener noreferrer" className="sec-all">Follow us on YouTube -&gt;</a>
          </div>

          <ReelsRail reels={reels} />
        </div>
      </section>

      {featured.length > 0 ? (
        <section className="section section-alt" id="featured">
          <div className="container">
            <div className="sec-head">
              <div className="sec-head-left">
                <div className="sec-eyebrow">
                  <div className="sec-rule"></div>
                </div>
                <h2 className="sec-title">Featured <em>KastoChha</em></h2>
                <p className="sec-sub">Curated Reviews and In-Depth Editorial Opinions.</p>
              </div>
              <a href="/featured" className="sec-all">Front page -&gt;</a>
            </div>

            <div className={`feat-grid feat-grid-${featCount} bento-grid fi`}>
              {featuredMain ? (
                <div className="fc fc-main bento-card">
                  <a href={storyHref(featuredMain)} className="fc-visual">
                    <div className="fc-star">Editor pick</div>
                    <div className="fc-emoji"><FeaturedIcon type={featuredMain.icon} /></div>
                  </a>
                  <div className="fc-body">
                    {featuredMain.why_text ? (
                      <span className="fc-why">{featuredMain.why_text}</span>
                    ) : null}
                    <div className="fc-title">
                      <a href={storyHref(featuredMain)} className="fc-title-link">
                        {featuredMain.title}
                      </a>
                    </div>
                    {featuredMain.description ? (
                      <div className="fc-desc">{featuredMain.description}</div>
                    ) : null}
                    {/* Always offer a way in: a story with no link_url still has
                        its own permalink. */}
                    <a href={storyHref(featuredMain)} className="fc-read">Read full story -&gt;</a>
                    <ShareRow text={featuredMain.title} url={`/featured/${featuredMain.id}`} label="Share" />
                  </div>
                </div>
              ) : null}

              {featuredSide.map((story, index) => (
                <div
                  className={`fc ${index === 0 ? "fc-b" : "fc-c"} bento-card`}
                  key={story.id}
                >
                  <a href={storyHref(story)} className="fc-visual">
                    <div className="fc-emoji"><FeaturedIcon type={story.icon} /></div>
                  </a>
                  <div className="fc-body">
                    {story.why_text ? <span className="fc-why">{story.why_text}</span> : null}
                    <div className="fc-title">
                      <a href={storyHref(story)} className="fc-title-link">
                        {story.title}
                      </a>
                    </div>
                    {story.description ? (
                      <div className="fc-desc">{story.description}</div>
                    ) : null}
                    <a href={storyHref(story)} className="fc-read">Read -&gt;</a>
                    <ShareRow text={story.title} url={`/featured/${story.id}`} label="Share" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <footer className="site-footer">
        <div className="foot-inner">
          <div className="foot-grid">
            <div className="foot-brand">
              <a href="/" className="foot-logo">Kasto<em>Chha</em></a>
              <p className="foot-tagline">Nepal&apos;s community-driven platform for real experiences, honest opinions, and trusted recommendations.</p>
            </div>
            {FOOTER_COLUMNS.map((column) => (
              <div className="foot-col" key={column.title}>
                <h5>{column.title}</h5>
                <ul>
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noreferrer" : undefined}
                        onClick={link.href === "#" ? (event) => event.preventDefault() : undefined}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="foot-bottom">
            <span>© 2026 KastoChha. Nepal&apos;s Curious Community Network.</span>
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
                {CATEGORY_LABELS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="tpill"
                    onClick={(e) => toggleT(e.currentTarget)}
                  >
                    {label}
                  </button>
                ))}
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
            <ModalError message={modalError} signIn={needsSignIn} />
            <button
              type="button"
              className="fsub"
              disabled={busy}
              onClick={() => submitForm("share")}
            >
              {busy ? "Posting..." : "Share Experience ->"}
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
                {CATEGORY_LABELS.map((label) => (
                  <option key={label}>{label}</option>
                ))}
              </select>
            </div>
            <ModalError message={modalError} signIn={needsSignIn} />
            <button
              type="button"
              className="fsub"
              style={{ marginTop: "6px" }}
              disabled={busy}
              onClick={() => submitForm("ask")}
            >
              {busy ? "Posting..." : "Post Question ->"}
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
