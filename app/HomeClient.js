"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import SiteNav from "./components/SiteNav";
import TrendingCards from "./components/TrendingCards";
import BattleSplit from "./components/BattleSplit";
import DiscussionsGrid from "./components/DiscussionsGrid";
import QuestionsWall from "./components/QuestionsWall";
import ReelsRail from "./components/ReelsRail";
import ShareRow from "./components/ShareRow";
import useScrollReveal from "./components/useScrollReveal";
import useTypedPlaceholder from "./components/useTypedPlaceholder";
import useRequireSignIn from "./components/useRequireSignIn";
import TopicSuggest from "./components/TopicSuggest";
import {
  IconBook,
  IconBriefcase,
  IconCheck,
  IconChat,
  IconHome
} from "./components/icons";
import { CATEGORY_LABELS, categoryLabel } from "../lib/categories";
import { topicSlug } from "../lib/slug";
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

// The footer's own display order for "Our Channels" — deliberately separate
// from CHANNELS' own order in lib/channels.js, which the contact page's
// channel grid also reads. Reordering CHANNELS itself would have silently
// reordered that page too; this reorders only what the footer renders.
const FOOTER_CHANNEL_ORDER = [
  "KastoChha Motors",
  "KastoChha Tech & Gadgets",
  "KastoChha Entertainment",
  "KastoChha Travel",
  "KastoChha Food",
  "KastoChha Paisa",
  "KastoChha Career",
  "KastoChha Health & Lifestyle",
  "KastoChha Muglan"
];

const footerChannels = () => {
  const bySequence = new Map(FOOTER_CHANNEL_ORDER.map((label, index) => [label, index]));
  // Anything not in the list above (e.g. a channel added later) falls in
  // after the named ones, in whatever order CHANNELS already has it, rather
  // than silently vanishing from the footer.
  return [...CHANNELS].sort((a, b) => {
    const posA = bySequence.has(a.label) ? bySequence.get(a.label) : FOOTER_CHANNEL_ORDER.length;
    const posB = bySequence.has(b.label) ? bySequence.get(b.label) : FOOTER_CHANNEL_ORDER.length;
    return posA - posB;
  });
};

const FOOTER_COLUMNS = [
  {
    title: "Explore",
    links: [
      { label: "Answer Engine", href: "/chat" },
      { label: "Trending", href: "/trending" },
      { label: "Battle", href: "/battle" },
      { label: "Discussions", href: "/discussions" },
      // Reels has no page of its own yet, so this still jumps to the
      // homepage section rather than guessing at a route.
      { label: "Reels", href: "/#reels" },
      { label: "Featured", href: "/featured" }
    ]
  },
  { title: "Our Channels", links: asFooterLinks(footerChannels()) },
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
function ModalError({ message, signIn, onSignIn }) {
  if (!message) return null;
  return (
    <div className="modal-error" role="alert">
      <span>{message}</span>
      {signIn ? (
        // A button, not a link: navigating to /sign-in would unmount this modal
        // and lose the draft the message just promised to keep. Clerk opens on
        // top instead, then the post is submitted automatically.
        <button type="button" className="modal-error-link" onClick={onSignIn}>
          Sign in -&gt;
        </button>
      ) : null}
    </div>
  );
}

function FeaturedIcon({ type }) {
  if (type === "home") return <IconHome className="icon" />;
  if (type === "briefcase") return <IconBriefcase className="icon" />;
  return <IconBook className="icon" />;
}

// A real photo if one was set, otherwise the fixed icon it's replacing —
// same fallback either card size already had, just conditional on whether
// this particular story has image_url. `fill` needs the positioned,
// overflow:hidden box .fc-visual already is, so no new CSS for this.
function FeaturedVisual({ story }) {
  if (story.image_url) {
    return (
      <Image
        src={story.image_url}
        alt={story.image_alt || story.title}
        fill
        sizes="(max-width: 720px) 100vw, 50vw"
        style={{ objectFit: "cover" }}
      />
    );
  }
  return (
    <div className="fc-emoji">
      <FeaturedIcon type={story.icon} />
    </div>
  );
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
  // Drives the hero search button's "Searching..." label while /chat loads.
  const [searching, startSearch] = useTransition();
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  // This form is read from the DOM at submit rather than held in state, so the
  // topic is mirrored here purely to drive the suggestions.
  const [shareTopic, setShareTopic] = useState("");
  // The thread the typed topic will join, if it already exists. Reported by
  // TopicSuggest from the server search, so it covers every thread rather than
  // only the ones this page happened to load.
  const [joiningThread, setJoiningThread] = useState(null);
  const [askTopic, setAskTopic] = useState("");
  const [existingAskQuestion, setExistingAskQuestion] = useState(null);
  // This modal reads its fields from the DOM at submit, so restoring means
  // writing the values back into the inputs and reopening the right tab.
  const requireSignIn = useRequireSignIn({
    draftKey: "home:modal",
    onRestore: (draft) => {
      openModal(draft.tab || "share");
      const set = (id, value) => {
        const el = document.getElementById(id);
        if (el && value) el.value = value;
      };
      set("sh-topic", draft.topic);
      set("sh-exp", draft.summary);
      set("ask-q", draft.question);
      set("ask-cat", draft.category);
      setShareTopic(draft.topic || "");
      setAskTopic(draft.question || "");
      setModalError("Signed in — ready to post.");
      calcProg();
    }
  });
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

  // /chat is a heavy route, so a click on "Go" could sit there looking dead for
  // a second or more while it loads — long enough for someone to press it
  // again. Wrapping the push in a transition gives the button a real pending
  // state that React clears on its own once the new route is ready, including
  // when the visitor comes back to the homepage.
  const submitSearch = () => {
    if (searching) return;
    const input = document.getElementById("srch");
    const value = input ? input.value.trim() : "";
    if (!value) return;
    startSearch(() => {
      router.push(`/chat?q=${encodeURIComponent(value)}`);
    });
  };

  const handleSearchKey = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitSearch();
  };

  // Grows the box to fit what's typed instead of scrolling the start of a
  // long query out of view — reset to "auto" first so it can shrink back
  // down too, not just grow. Capped by max-height in CSS, past which it
  // scrolls internally rather than growing indefinitely.
  const autoResizeSearch = (el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const fillSearch = (text, el) => {
    const input = document.getElementById("srch");
    if (input) {
      input.value = text;
      input.focus();
      // Setting .value directly doesn't fire input/resize either — same
      // reason the line below already stands in for onInput's other job.
      autoResizeSearch(input);
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

  // Answering an open question reuses the share flow: open the modal with the
  // question already filled in as the topic and its niche preselected, so the
  // only thing left to do is write the actual answer. Retyping the question by
  // hand is exactly the friction that stops people replying.
  const answerQuestion = (item) => {
    openModal("share");

    // Pre-fill the SUBJECT, not the question. This used to insert the whole
    // question text, so answering "Sikko calculator kasto chha?" created a
    // thread called "sikko-calculator-kasto-chha" beside the existing
    // "sikko-calculator" — two threads about one product, which is the
    // fragmentation topic slugs exist to prevent.
    //
    // item.title covers a thread from /api/topics/search (Share's shape,
    // and now Ask's too, since Ask's exact-match handler passes the whole
    // thread rather than just its nested question). item.topic/item.question
    // stay as fallbacks for the older nested shape, so this keeps working
    // wherever else answerQuestion gets called with that shape instead.
    const topicInput = document.getElementById("sh-topic");
    const prefill = item.title || item.topic || item.question || "";
    if (topicInput) topicInput.value = prefill;
    setShareTopic(prefill);

    const label = categoryLabel(item.category);
    document.querySelectorAll(".tpill").forEach((pill) => {
      pill.classList.toggle("on", pill.textContent.trim() === label);
    });

    calcProg();
    // The modal is always mounted (just hidden), so this only waits for the
    // open transition rather than for the node to exist.
    setTimeout(() => document.getElementById("sh-exp")?.focus(), 140);
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
      // Required when sharing. This used to fall back to "General" here, so the
      // API's own check never fired and an unselected category silently became
      // a value nobody chose — which is how threads ended up filed under
      // labels that were not in the picker.
      //
      // Asking still falls back to "Other": someone asking has not formed a
      // view yet, so being unsure where it belongs is reasonable. Someone
      // sharing has been there and can say.
      // Required only when starting a new thread. Joining one adopts its
      // category, and the picker is hidden in that case — blocking on a field
      // nobody can see would be a dead end.
      if (!categories[0] && !joiningThread) {
        setModalError("Pick a category so people can find this.");
        return;
      }

      endpoint = "/api/reviews";
      payload = {
        title,
        // The server overrides this with the thread's own category when the
        // slug matches, but sending it keeps the request honest rather than
        // relying on that.
        category: categories[0] || joiningThread?.category || "Other",
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

      // An exact existing question must not be posted again. The existing
      // question is already available through "Share Experience" above.
      if (existingAskQuestion) {
        setModalError("This question already exists. Share your experience instead.");
        return;
      }

      // A question starts a discussion rather than living in its own table, so
      // it posts to the same endpoint as an experience and differs only by
      // kind. The subject names the thread; the question is its opening post.
      //
      // Asking about a subject that already has a thread adds to that thread —
      // the API folds matching slugs together — instead of forking a near
      // duplicate.
      // The question IS the thread. "BYD ko battery kati tikchha?" is its own
      // discussion, distinct from "BYD ko resale value" — each targets what
      // someone actually wants to know, and each accumulates its own answers.
      //
      // So there is no separate subject to collect. The question names the
      // thread, and the suggestions under the field are what stop a near
      // duplicate: type "byd" and every existing BYD thread appears, so joining
      // one is easier than starting another.
      endpoint = "/api/reviews";
      payload = {
        kind: "question",
        title: question,
        summary: question,
        // Optional when asking, required when sharing. Someone asking has not
        // formed a view yet, so being unsure where it belongs is reasonable;
        // someone sharing has been there and can say. "Other" is now a real
        // option in the picker, so this fallback is something they could have
        // chosen themselves rather than a value that only appears afterwards.
        category: category || "Other"
      };
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
    setShareTopic("");
    setAskTopic("");
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
  // Curated quick-search chips under the hero search bar. Bare topics, not
  // "<topic> kasto chha?" questions: clicking a chip drops its text straight
  // into the search box, so a suffix here would show up twice over — once on
  // the chip and again in the input the visitor is about to send.
  const chipItems = [
    "Loksewa exam",
    "BYD ko gaadi",
    "ABC Trek",
    "Sandar ko momo",
    "IPO parne chance"
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
  // getRecentQuestions already returns only threads with no experiences on
  // them, so everything here is open by definition.
  //
  // This used to pair a question with its answers by slugifying the entire
  // question text and looking for a thread with that exact slug —
  // "sikko-calculator-kasto-chha" against "sikko-calculator" — which almost
  // never matched. Every question showed as unanswered however many people had
  // replied. Now a question and its answers are the same thread, so there is
  // nothing to reconcile.
  // getRecentQuestions returns threads that have not yet cleared the
  // indexation gate, with a real answer count attached — so a thread with one
  // reply still shows here, and shows that one reply, rather than reading zero
  // until it vanishes.
  const openQuestions = questions.map((item) => ({
    ...item,
    answers: item.answers || 0,
    threadSlug: item.topic_slug || ""
  }));

  const featuredMain = featured.find((item) => item.slot === "main") || featured[0] || null;
  // Up to 3 side stories alongside the lead — 4 total, a plain blog-style
  // count rather than the old fixed 3-card bento layout.
  const featuredSide = featured.filter((item) => item !== featuredMain).slice(0, 3);
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
            <textarea
              id="srch"
              rows={1}
              placeholder={searchPlaceholder}
              autoComplete="off"
              onKeyDown={handleSearchKey}
              onInput={(event) => {
                setHasQuery(event.currentTarget.value.trim().length > 0);
                autoResizeSearch(event.currentTarget);
              }}
            />
            <button
              type="button"
              className={`s-btn${searching ? " searching" : ""}`}
              onClick={submitSearch}
              disabled={searching}
              aria-busy={searching}
            >
              {searching ? "Searching..." : "Go"}
            </button>
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
            <a href="/discussions" className="sec-all">All discussions -&gt;</a>
          </div>

          <DiscussionsGrid reviews={reviews} limit={6} />

{/* Open questions sit directly under the discussion grid: "here is the
              conversation, and here is where it needs you". The share block
              follows both, because a call to action lands better once someone
              has seen why they'd bother than wedged between two lists. */}
  <div className="qwall-block" id="questions">
          <div className="qwall-inner">
            <div className="sec-head">
              <div className="sec-head-left">
                <div className="sec-eyebrow">
                  <div className="sec-rule"></div>
                </div>
                <h2 className="sec-title">Community is <em>Asking</em></h2>
                <p className="sec-sub">
                  Real questions from people across Nepal, still waiting on
                  someone who has been there. Tapai lai thaha chha bhane, bhanidinus.
                </p>
              </div>
              <button type="button" className="sec-all" onClick={() => openModal("ask")}>
                Ask a question -&gt;
              </button>
            </div>

            <QuestionsWall
              questions={openQuestions}
              onAnswer={answerQuestion}
              onAsk={() => openModal("ask")}
            />
          </div>
        </div>

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
                    <FeaturedVisual story={featuredMain} />
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

              {featuredSide.length > 0 ? (
                <div className="feat-side-row">
                  {featuredSide.map((story) => (
                    <div className="fc fc-side bento-card" key={story.id}>
                      <a href={storyHref(story)} className="fc-visual">
                        <FeaturedVisual story={story} />
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
                        <ShareRow text={story.title} url={`/featured/${story.slug || story.id}`} label="Share" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
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
              <input
                className="finp"
                id="sh-topic"
                type="text"
                placeholder="e.g. delivery experience"
                onInput={(event) => {
                  setShareTopic(event.target.value);
                  calcProg();
                }}
              />
              <TopicSuggest
                value={shareTopic}
                onExactMatch={setJoiningThread}
                onPick={(title) => {
                  const input = document.getElementById("sh-topic");
                  if (input) input.value = title;
                  setShareTopic(title);
                  calcProg();
                }}
              />
            </div>
            <div className="fg">
              <div className="flbl"><span className="fstep">2</span>Verdict</div>
              <div className="vgrid">
                <button type="button" className="vbtn-m ramro" id="vr" onClick={() => pickV("ramro")}>Ramro chha</button>
                <button type="button" className="vbtn-m thikai" id="vt" onClick={() => pickV("thikai")}>Thikai chha</button>
                <button type="button" className="vbtn-m naramro" id="vn" onClick={() => pickV("naramro")}>Naramro chha</button>
              </div>
            </div>
            {/* Joining an existing thread adopts its category server-side, so
                showing a picker here would ask for a value and then discard it.
                Say what is about to happen instead — the same treatment the
                /discussions form already gives it. */}
            {joiningThread ? (
              <div className="fg">
                <div className="topic-match-note">
                  <strong>Joining existing topic</strong>
                  <span>
                    {joiningThread.title} · {joiningThread.experiences} experience
                    {joiningThread.experiences === 1 ? "" : "s"}
                    {joiningThread.category ? ` · ${categoryLabel(joiningThread.category)}` : ""}
                  </span>
                </div>
              </div>
            ) : (
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
            )}
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
            <ModalError
              message={modalError}
              signIn={needsSignIn}
              onSignIn={() =>
                requireSignIn(() => submitForm(activeTabRef.current), {
                  tab: activeTabRef.current,
                  topic: document.getElementById("sh-topic")?.value || "",
                  summary: document.getElementById("sh-exp")?.value || "",
                  question: document.getElementById("ask-q")?.value || "",
                  category: document.getElementById("ask-cat")?.value || ""
                })
              }
            />
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
              <textarea
                className="fta"
                id="ask-q"
                placeholder="e.g. BYD ko battery kati barsa tikchha?"
                onInput={(event) => setAskTopic(event.target.value)}
              ></textarea>
              <TopicSuggest
                value={askTopic}
                onExactMatch={(topic) => {
                  // The thread existing is what matters, not what kind its
                  // opening post happened to be. Reading topic?.question here
                  // meant a thread that started as an experience (most of
                  // them) never triggered this, even though the same typed
                  // text correctly matched it on the Share side — Share
                  // checks "does this thread exist", this checked "does this
                  // thread have a question on it", a narrower and different
                  // question.
                  setExistingAskQuestion(topic || null);
                }}
                onPick={(title, topic) => {
                  const input = document.getElementById("ask-q");
                  if (input) input.value = title;
                  setAskTopic(title);
                  setExistingAskQuestion(topic || null);
                }}
              />
              {existingAskQuestion ? (
                <div className="topic-match-note">
                  <strong>This question already exists.</strong>
                  <span>Share your experience instead?</span>
                  <button
                    type="button"
                    className="qcard-cta"
                    onClick={() => answerQuestion(existingAskQuestion)}
                  >
                    Share Experience
                  </button>
                </div>
              ) : null}
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
            <ModalError
              message={modalError}
              signIn={needsSignIn}
              onSignIn={() =>
                requireSignIn(() => submitForm(activeTabRef.current), {
                  tab: activeTabRef.current,
                  topic: document.getElementById("sh-topic")?.value || "",
                  summary: document.getElementById("sh-exp")?.value || "",
                  question: document.getElementById("ask-q")?.value || "",
                  category: document.getElementById("ask-cat")?.value || ""
                })
              }
            />
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
