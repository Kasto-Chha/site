"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import ChatText from "./ChatText";
import { formatTimeAgo } from "../../lib/topics";
import { TOPIC_TITLE_MAX, topicTitle } from "../../lib/chatTopics";

// Starter topics, not full questions — the empty state tells people to name a
// thing and the assistant gives the verdict. The chip shows the bare topic but
// sends it as a "kasto chha?" question, so the model reliably answers in the
// verdict-first house style instead of writing an encyclopedia entry.
const SUGGESTIONS = [
  "CBR 600 RR",
  "Sandaar ko Momo",
  "iPhone 17 Pro Max",
  "Hilux Gaadi"
];

const asQuestion = (topic) => `${topic} kasto chha?`;

const DAY_MS = 24 * 60 * 60 * 1000;

// Conversations are stored per user and listed newest-active first; the sidebar
// splits that one ordered list into the usual date buckets so a long history
// stays scannable.
function groupByDate(items) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const buckets = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] }
  ];

  for (const item of items) {
    const at = new Date(item.last_message_at || 0).getTime();
    if (!at || Number.isNaN(at)) buckets[3].items.push(item);
    else if (at >= startOfToday) buckets[0].items.push(item);
    else if (at >= startOfToday - DAY_MS) buckets[1].items.push(item);
    else if (at >= startOfToday - 7 * DAY_MS) buckets[2].items.push(item);
    else buckets[3].items.push(item);
  }

  return buckets.filter((bucket) => bucket.items.length);
}

// Union by id, newest activity first. Search can surface conversations older
// than the page's first slice, so results are folded into the same list rather
// than kept in a second one that rename/delete would have to stay in sync with.
function mergeTopics(current, incoming) {
  const byId = new Map(current.map((topic) => [topic.id, topic]));
  for (const row of incoming) {
    if (!row?.id) continue;
    byId.set(row.id, { ...byId.get(row.id), ...row });
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)
  );
}

function describeTopic(topic) {
  const parts = [];
  if (topic.last_message_at) parts.push(formatTimeAgo(topic.last_message_at));
  if (topic.message_count) {
    parts.push(`${topic.message_count} message${topic.message_count === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

export default function ChatClient({
  topics: initialTopics = [],
  recent = [],
  prompts = [],
  // Whether the server resolved a signed-in user for this request. See the
  // `signedIn` note below for why the client can't just ask Clerk.
  initialSignedIn = false,
  trialLimit = 3,
  initialTrialLeft = null,
  initialDailyLeft = null,
  // Passed in rather than imported: the threshold lives with the quota logic in
  // lib/chatQuota.js, which is server-side and has no business in this bundle.
  quotaWarnAt = 5
}) {
  const searchParams = useSearchParams();
  const initialQuery = (searchParams.get("q") || "").trim();
  // `isSignedIn` is undefined until Clerk hydrates on the client, and the whole
  // sidebar keys off it: the history block renders only when it is true, and
  // the "Sign in to KastoChha" card renders whenever it is falsy. Undefined is
  // falsy, so a signed-in user was served the signed-out sidebar — no chat
  // history — on every single load, and kept it for as long as Clerk took to
  // load (forever, if its script is slow, blocked, or offline).
  //
  // The server already answered this question: it called auth() to fetch this
  // user's conversations, so it knows. Trust that until Clerk's own state is
  // actually loaded, then defer to Clerk so signing in or out through a modal
  // still updates the sidebar without a reload.
  const { isSignedIn: clerkSignedIn, isLoaded } = useUser();
  const signedIn = isLoaded ? Boolean(clerkSignedIn) : initialSignedIn;

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  // The user's conversations, and which one the thread on screen belongs to.
  // Empty activeId = a new conversation that the server hasn't filed yet.
  const [topics, setTopics] = useState(initialTopics);
  const [activeId, setActiveId] = useState("");
  const [openingId, setOpeningId] = useState("");
  const [search, setSearch] = useState("");
  // Ids returned by the server for the current search, or null while the
  // search hasn't answered yet (we fall back to filtering what's loaded).
  const [matchIds, setMatchIds] = useState(null);
  const [renamingId, setRenamingId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [clearing, setClearing] = useState(false);
  // null while signed in (no trial applies). The server is the authority — this
  // is refreshed from a response header after every answer.
  const [trialLeft, setTrialLeft] = useState(initialTrialLeft);
  const [signUpRequired, setSignUpRequired] = useState(false);
  // Daily quota left for a signed-in account, as last reported by the server.
  // null = unknown (not signed in yet, or the account is exempt).
  const [dailyLeft, setDailyLeft] = useState(initialDailyLeft);
  const [dailyLimitHit, setDailyLimitHit] = useState(initialDailyLeft === 0);

  const onTrial = !signedIn && trialLeft !== null;
  const locked = signUpRequired || (onTrial && trialLeft <= 0) || dailyLimitHit;

  // The sidebar is a permanent column from 861px up and a drawer below it, so
  // phones can reach chat history and the community rail at all — they used to
  // be display:none, which meant a phone could start conversations but never
  // reopen one.
  const [drawerOpen, setDrawerOpen] = useState(false);

  const idRef = useRef(0);
  const startedRef = useRef(false);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  // Grows the composer to fit what's typed instead of scrolling within a
  // fixed single line — the CSS (max-height, resize:none, the form's
  // align-items:flex-end) was already built for this, this is the missing
  // piece that actually resizes it. A useEffect keyed on `input` rather than
  // doing this inline in onChange, because this is a controlled textarea —
  // measuring scrollHeight needs to happen after React has already painted
  // the new value, not before. Also correctly shrinks the box back down
  // when input is cleared after sending, for the same reason.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);
  // send() is called from a mount effect that closes over the first render's
  // state, so the conversation it should append to is read through a ref.
  const activeIdRef = useRef("");
  const skipRenameBlurRef = useRef(false);

  const nextId = () => {
    idRef.current += 1;
    return `m${idRef.current}`;
  };

  const setActiveTopic = (id) => {
    activeIdRef.current = id;
    setActiveId(id);
  };

  const updateMessage = (id, content) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content } : m))
    );
  };

  // Move the conversation this answer belongs to to the top of the sidebar,
  // adding it if the server just created it.
  const recordTopic = (id, firstQuestion) => {
    const stamp = new Date().toISOString();
    setTopics((prev) => {
      const existing = prev.find((topic) => topic.id === id);
      const rest = prev.filter((topic) => topic.id !== id);
      const row = existing
        ? {
            ...existing,
            last_message_at: stamp,
            message_count: (existing.message_count || 0) + 2
          }
        : {
            id,
            title: topicTitle(firstQuestion),
            message_count: 2,
            last_message_at: stamp
          };
      return [row, ...rest];
    });
  };

  const send = async (text) => {
    const content = (text || "").trim();
    if (!content || streaming || locked) return;

    const userMsg = { id: nextId(), role: "user", content };
    const assistantMsg = { id: nextId(), role: "assistant", content: "" };
    const base = [...messages, userMsg];

    setMessages([...base, assistantMsg]);
    setInput("");
    setStreaming(true);
    // Sending a message is you saying "show me what happens next" — re-engage
    // auto-follow even if you'd scrolled up to reread something earlier,
    // same as Claude's and ChatGPT's own interfaces do on your own send.
    isAtBottomRef.current = true;
    setShowJumpButton(false);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: base.map(({ role, content }) => ({ role, content })),
          // Blank on the first message of a chat — the server opens a new
          // conversation and hands its id back below.
          topicId: activeIdRef.current || ""
        })
      });

      // The server owns both counters; mirror whatever it reports.
      const remaining = response.headers.get("X-Chat-Trial-Remaining");
      if (remaining !== null) setTrialLeft(Number(remaining) || 0);
      const daily = response.headers.get("X-Chat-Daily-Remaining");
      if (daily !== null) setDailyLeft(Number(daily) || 0);

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        if (data?.signUpRequired) setSignUpRequired(true);
        if (data?.limitReached) setDailyLimitHit(true);
        updateMessage(
          assistantMsg.id,
          data?.error || "Sorry, something went wrong. Please try again."
        );
        return;
      }

      const savedTopicId = response.headers.get("X-Chat-Topic-Id");
      if (savedTopicId) {
        setActiveTopic(savedTopicId);
        // Guests get a topic id too (it keeps their few turns threaded) but
        // have no sidebar to list it in.
        if (signedIn) recordTopic(savedTopicId, content);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        updateMessage(assistantMsg.id, acc);
      }
    } catch (error) {
      updateMessage(
        assistantMsg.id,
        "Network error reaching the assistant. Please try again."
      );
    } finally {
      setStreaming(false);
    }
  };

  // Auto-send the search-box query once on load.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (initialQuery) send(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signing in from the gate (Clerk's modal, so the page never reloads) has to
  // release the lock and retire the trial counter. The thread on screen was
  // filed under an unowned guest topic, so it is detached here: the next
  // message opens a conversation that actually belongs to the new account.
  useEffect(() => {
    if (!signedIn) return;
    setSignUpRequired(false);
    setTrialLeft(null);
    setActiveTopic("");
  }, [signedIn]);

  // Keep the conversation scrolled to the latest message — but only while
  // the user is already following along at the bottom. The previous version
  // forced this unconditionally on every streamed chunk, which fought anyone
  // who deliberately scrolled up mid-answer to re-read something — the exact
  // opposite of how Claude's or ChatGPT's own interface behaves: auto-follow
  // while at the bottom, hands off the moment you scroll away, until you
  // scroll back yourself or tap the jump-to-latest button below.
  //
  // isAtBottomRef, not state, so this effect keeps depending only on
  // `messages` — reading the ref's current value when new content arrives,
  // rather than also re-firing every time the user's scroll position itself
  // changes.
  const isAtBottomRef = useRef(true);
  const [showJumpButton, setShowJumpButton] = useState(false);

  // Tracks the composer's real, current height (it can grow past one line —
  // see the auto-grow patch) so the jump button can float just above it
  // exactly, rather than sitting at a fixed distance from the bottom of the
  // screen that would put it behind an expanded composer instead of above
  // it. Measures the whole .chat-composer wrapper, padding included, rather
  // than just the inner form, so this doesn't need to separately hardcode
  // that padding as a number that could silently drift from the CSS later.
  // ResizeObserver rather than a resize/input event, since it also catches
  // the composer growing on window resize or font load, not just typing.
  const composerRef = useRef(null);
  const [composerHeight, setComposerHeight] = useState(0);

  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setComposerHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = distanceFromBottom < 80;
      isAtBottomRef.current = atBottom;
      setShowJumpButton(!atBottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    isAtBottomRef.current = true;
    setShowJumpButton(false);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el && isAtBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Drawer: close on Escape, and don't let the thread behind it scroll.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  // Search the user's own conversation titles server-side, so chats older than
  // the slice rendered on the page are still findable.
  useEffect(() => {
    const term = search.trim();
    if (!signedIn || term.length < 2) {
      setMatchIds(null);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/chat/history?q=${encodeURIComponent(term)}`,
          { credentials: "include" }
        );
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        const rows = Array.isArray(data.topics) ? data.topics : [];
        if (cancelled) return;
        setTopics((prev) => mergeTopics(prev, rows));
        setMatchIds(rows.map((row) => row.id));
      } catch {
        // Leave matchIds null and fall back to the local filter below.
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, signedIn]);

  const handleSubmit = (event) => {
    event.preventDefault();
    send(input);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send(input);
    }
  };

  const newChat = () => {
    if (streaming) return;
    setMessages([]);
    setInput("");
    setActiveTopic("");
    setDrawerOpen(false);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/chat");
    }
    textareaRef.current?.focus();
  };

  // Reopen a stored conversation: its turns come back from the database, and
  // follow-ups then append to that same topic instead of starting a new one.
  const openTopic = async (id) => {
    if (streaming || id === activeId) return;
    setDrawerOpen(false);
    setOpeningId(id);
    try {
      const response = await fetch(
        `/api/chat/history?topicId=${encodeURIComponent(id)}`,
        { credentials: "include" }
      );
      if (!response.ok) return;
      const data = await response.json().catch(() => ({}));
      const rows = Array.isArray(data.messages) ? data.messages : [];
      setMessages(
        rows.map((row) => ({
          id: row.id,
          role: row.role === "assistant" ? "assistant" : "user",
          content: row.content || ""
        }))
      );
      setActiveTopic(id);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/chat");
      }
    } catch {
      // Leave whatever is on screen alone.
    } finally {
      setOpeningId("");
    }
  };

  const startRename = (topic) => {
    skipRenameBlurRef.current = false;
    setRenamingId(topic.id);
    setRenameValue(topic.title);
  };

  // Enter and Escape both unmount the input, which can fire onBlur behind them.
  // The ref is read synchronously, so the second commit is dropped whatever
  // order React batches the state updates in.
  const endRename = () => {
    skipRenameBlurRef.current = true;
    setRenamingId("");
  };

  const commitRename = async (id) => {
    const title = renameValue.trim();
    endRename();
    const previous = topics;
    const current = previous.find((topic) => topic.id === id);
    if (!title || !current || title === current.title) return;

    setTopics((items) =>
      items.map((topic) => (topic.id === id ? { ...topic, title: topicTitle(title) } : topic))
    );
    try {
      const response = await fetch("/api/chat/history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, title })
      });
      if (!response.ok) setTopics(previous);
    } catch {
      setTopics(previous);
    }
  };

  const deleteTopic = async (id) => {
    const previous = topics;
    setTopics((items) => items.filter((topic) => topic.id !== id));
    if (id === activeId) {
      setMessages([]);
      setActiveTopic("");
    }
    try {
      const response = await fetch("/api/chat/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id })
      });
      if (!response.ok) setTopics(previous); // revert on failure
    } catch {
      setTopics(previous);
    }
  };

  const clearHistory = async () => {
    if (clearing || topics.length === 0) return;
    const previous = topics;
    setClearing(true);
    setTopics([]);
    setMessages([]);
    setActiveTopic("");
    try {
      const response = await fetch("/api/chat/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ all: true })
      });
      if (!response.ok) setTopics(previous);
    } catch {
      setTopics(previous);
    } finally {
      setClearing(false);
    }
  };

  const railPrompts = Array.from(new Set([...prompts, ...recent]))
    .filter(Boolean)
    .slice(0, 6);

  const term = search.trim().toLowerCase();
  const visibleTopics = !term
    ? topics
    : matchIds
      ? topics.filter((topic) => matchIds.includes(topic.id))
      : topics.filter((topic) => (topic.title || "").toLowerCase().includes(term));
  const groups = term
    ? [{ label: `${visibleTopics.length} found`, items: visibleTopics }]
    : groupByDate(visibleTopics);

  const isEmpty = messages.length === 0;

  return (
    <div className={`chat-app${drawerOpen ? " drawer-open" : ""}`}>
      {/* Only rendered as a real backdrop below the drawer breakpoint (CSS);
          above it the sidebar is a normal column and this never shows. */}
      <div
        className="chat-drawer-scrim"
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <aside className="chat-sidebar" id="chat-sidebar">
        <div className="chat-side-top">
          <Link href="/" className="chat-logo" aria-label="KastoChha home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kastochha-logo.svg" alt="KastoChha" />
          </Link>
          <button
            type="button"
            className="chat-drawer-x"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            ×
          </button>
          <button
            type="button"
            className="chat-newbtn"
            onClick={newChat}
            disabled={streaming}
          >
            + New chat
          </button>
        </div>

        <div className="chat-side-scroll">
          {!signedIn ? (
            <div className="chat-side-block">
              <div className="chat-signin-card">
                <div className="chat-signin-title">Sign in to KastoChha</div>
                <p className="chat-signin-body">
                  Keep your chat history, ask without limits, and join the
                  community.
                </p>
                <SignInButton mode="modal">
                  <button type="button" className="btn-red">Sign in</button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button type="button" className="chat-signin-alt">
                    Create a free account
                  </button>
                </SignUpButton>
              </div>
            </div>
          ) : null}

          {signedIn ? (
            <div className="chat-side-block">
              <div className="chat-side-head">
                <span className="chat-side-label">Your chats</span>
                {topics.length > 0 ? (
                  <button
                    type="button"
                    className="chat-history-clear"
                    onClick={clearHistory}
                    disabled={clearing}
                  >
                    Clear all
                  </button>
                ) : null}
              </div>

              {topics.length > 0 || term ? (
                <input
                  type="search"
                  className="chat-side-search"
                  placeholder="Search your chats"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search your chats"
                />
              ) : null}

              {visibleTopics.length === 0 ? (
                <p className="chat-side-empty">
                  {term
                    ? "No chat matches that."
                    : "Your conversations will be saved here."}
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.label} className="chat-history-group">
                    <div className="chat-history-group-label">{group.label}</div>
                    <ul className="chat-history-list">
                      {group.items.map((topic) => (
                        <li
                          key={topic.id}
                          className={`chat-history-item${
                            topic.id === activeId ? " is-active" : ""
                          }`}
                        >
                          {renamingId === topic.id ? (
                            <input
                              className="chat-history-rename"
                              value={renameValue}
                              maxLength={TOPIC_TITLE_MAX}
                              autoFocus
                              onChange={(event) => setRenameValue(event.target.value)}
                              onBlur={() => {
                                if (skipRenameBlurRef.current) {
                                  skipRenameBlurRef.current = false;
                                  return;
                                }
                                commitRename(topic.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  commitRename(topic.id);
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  endRename();
                                }
                              }}
                              aria-label="Rename chat"
                            />
                          ) : (
                            <>
                              <button
                                type="button"
                                className="chat-history-open"
                                onClick={() => openTopic(topic.id)}
                                disabled={streaming || openingId === topic.id}
                                title={topic.title}
                              >
                                <span className="chat-history-q">{topic.title}</span>
                                <span className="chat-history-time">
                                  {openingId === topic.id
                                    ? "Opening…"
                                    : describeTopic(topic)}
                                </span>
                              </button>
                              <button
                                type="button"
                                className="chat-history-act"
                                onClick={() => startRename(topic)}
                                aria-label={`Rename ${topic.title}`}
                                title="Rename"
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                className="chat-history-act chat-history-del"
                                onClick={() => deleteTopic(topic.id)}
                                aria-label={`Delete ${topic.title}`}
                                title="Delete"
                              >
                                ×
                              </button>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          ) : null}

        </div>

        {/* Pinned below the scrolling history rather than inside it. It used to
            sit at the end of the same scroll area, so once a user had more than
            a screenful of conversations the community rail was only reachable
            by scrolling past all of them. */}
        {railPrompts.length > 0 ? (
          <div className="chat-side-pinned">
            <div className="chat-side-label">Community is asking</div>
            <ul className="chat-side-list">
              {railPrompts.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      send(item);
                    }}
                    disabled={streaming}
                    title={item}
                  >
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="chat-side-foot">
          <Link href="/" className="chat-side-home">← Back to KastoChha</Link>
        </div>
      </aside>

      <main className="chat-main" id="main">
        <header className="chat-topbar">
          {/* Below 860px the sidebar is a drawer, so this is how a phone gets to
              its chat history and the community rail. */}
          <button
            type="button"
            className="chat-drawer-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open chats"
            aria-expanded={drawerOpen}
            aria-controls="chat-sidebar"
          >
            <span className="hamburger" aria-hidden />
          </button>
          <Link href="/" className="chat-topbar-title" aria-label="KastoChha home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kastochha-logo.svg" alt="KastoChha" className="chat-topbar-logo" />
            <span className="chat-topbar-tag">Assist</span>
          </Link>
          <button
            type="button"
            className="chat-topbar-new"
            onClick={newChat}
            disabled={streaming}
            aria-label="New chat"
          >
            +
          </button>
        </header>

        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-inner">
            {isEmpty ? (
              <div className="chat-welcome">
                <div className="chat-welcome-spark" aria-hidden="true">✦</div>
                <h1 className="chat-welcome-title">
                  Namaste! Aaja Tapailai <em>KastoChha?</em>
                </h1>
                <p className="chat-welcome-sub">
                  Type a topic, find out KastoChha — then ask follow-ups about
                  it too.
                </p>
                <div className="chat-suggests">
                  {SUGGESTIONS.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      className="chat-suggest"
                      onClick={() => send(asQuestion(topic))}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => {
                const isUser = message.role === "user";
                const pending = !isUser && !message.content && streaming;
                return (
                  <div
                    key={message.id}
                    className={`chat-msg ${isUser ? "is-user" : "is-assistant"}`}
                  >
                    <div className="chat-avatar" aria-hidden="true">
                      {isUser ? "You" : "KC"}
                    </div>
                    <div className="chat-bubble">
                      {pending ? (
                        // Between hitting send and the first token there was
                        // only an unlabelled row of dots, which reads the same
                        // whether the assistant is working or stuck. Say what
                        // is happening instead.
                        <span className="chat-working" role="status">
                          <span className="chat-typing" aria-hidden="true">
                            <span></span>
                            <span></span>
                            <span></span>
                          </span>
                          <span className="chat-working-text">
                            Khojdai chha — searching KastoChha…
                          </span>
                        </span>
                      ) : isUser ? (
                        // Whatever the visitor typed, shown verbatim.
                        message.content
                      ) : (
                        <ChatText content={message.content} />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {showJumpButton ? (
          <button
            type="button"
            className="chat-jump-bottom"
            onClick={jumpToBottom}
            aria-label="Jump to latest message"
            // 20px real gap above the composer's actual current height,
            // falling back to CSS's fixed 96px only for the brief instant
            // before ResizeObserver's first measurement lands (composerHeight
            // still 0 then).
            style={composerHeight ? { bottom: composerHeight + 20 } : undefined}
          >
            ↓ New message
          </button>
        ) : null}

        <div className="chat-composer" ref={composerRef}>
          {dailyLimitHit ? (
            // Signed in, but today's quota is spent. Nothing to sign up for
            // here — it just needs time, so the copy says so.
            <div className="chat-gate">
              <div className="chat-gate-title">Aaja ko limit sakiyo</div>
              <p className="chat-gate-body">
                You&apos;ve used today&apos;s questions on this account. The
                limit rolls over as your earlier questions pass 24 hours — feri
                sodhna ali bela pachi aaunus hai.
              </p>
            </div>
          ) : locked ? (
            // Trial spent. The composer stays visible but inert, so it's clear
            // what signing up unlocks.
            <div className="chat-gate">
              <div className="chat-gate-title">
                You&apos;ve used your {trialLimit} free questions
              </div>
              <p className="chat-gate-body">
                Create a free account to keep asking — and to save your chat
                history, vote, and share your own experiences.
              </p>
              <div className="chat-gate-actions">
                <SignUpButton mode="modal">
                  <button type="button" className="btn-red">Sign up free</button>
                </SignUpButton>
                <SignInButton mode="modal">
                  <button type="button" className="btn-outline">
                    I already have an account
                  </button>
                </SignInButton>
              </div>
            </div>
          ) : onTrial ? (
            <div className="chat-trial">
              <span className="chat-trial-count">
                {trialLeft} free question{trialLeft === 1 ? "" : "s"} left
              </span>
              <SignInButton mode="modal">
                <button type="button" className="chat-trial-link">
                  Sign in for unlimited
                </button>
              </SignInButton>
            </div>
          ) : dailyLeft !== null && dailyLeft <= quotaWarnAt ? (
            <div className="chat-trial">
              <span className="chat-trial-count">
                {dailyLeft} question{dailyLeft === 1 ? "" : "s"} left today
              </span>
            </div>
          ) : null}

          <form className="chat-composer-form" onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              className="chat-input"
              rows={1}
              placeholder={
                dailyLimitHit
                  ? "Aaja ko limit sakiyo — bholi feri sodhnus..."
                  : locked
                    ? "Sign up to keep chatting..."
                    : "Ask KastoChha Assist anything “KastoChha”"
              }
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={locked}
            />
            <button
              type="submit"
              className="chat-send"
              disabled={streaming || locked || !input.trim()}
              aria-label="Send"
            >
              {streaming ? "…" : "↑"}
            </button>
          </form>
          <div className="chat-disclaimer">
            KastoChha Assist can make mistakes. Verify important details.
          </div>
        </div>
      </main>
    </div>
  );
}
