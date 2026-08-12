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
  trialLimit = 3,
  initialTrialLeft = null
}) {
  const searchParams = useSearchParams();
  const initialQuery = (searchParams.get("q") || "").trim();
  const { isSignedIn } = useUser();

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

  const onTrial = !isSignedIn && trialLeft !== null;
  const locked = signUpRequired || (onTrial && trialLeft <= 0);

  const idRef = useRef(0);
  const startedRef = useRef(false);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
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

      // The server owns the trial count; mirror whatever it reports.
      const remaining = response.headers.get("X-Chat-Trial-Remaining");
      if (remaining !== null) setTrialLeft(Number(remaining) || 0);

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        if (data?.signUpRequired) setSignUpRequired(true);
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
        if (isSignedIn) recordTopic(savedTopicId, content);
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
    if (!isSignedIn) return;
    setSignUpRequired(false);
    setTrialLeft(null);
    setActiveTopic("");
  }, [isSignedIn]);

  // Keep the conversation scrolled to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Search the user's own conversation titles server-side, so chats older than
  // the slice rendered on the page are still findable.
  useEffect(() => {
    const term = search.trim();
    if (!isSignedIn || term.length < 2) {
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
  }, [search, isSignedIn]);

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
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/chat");
    }
    textareaRef.current?.focus();
  };

  // Reopen a stored conversation: its turns come back from the database, and
  // follow-ups then append to that same topic instead of starting a new one.
  const openTopic = async (id) => {
    if (streaming || id === activeId) return;
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
    <div className="chat-app">
      <aside className="chat-sidebar">
        <div className="chat-side-top">
          <Link href="/" className="chat-logo" aria-label="KastoChha home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kastochha-logo.svg" alt="KastoChha" />
          </Link>
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
          {!isSignedIn ? (
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

          {isSignedIn ? (
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

          {railPrompts.length > 0 ? (
            <div className="chat-side-block">
              <div className="chat-side-label">Community is asking</div>
              <ul className="chat-side-list">
                {railPrompts.map((item) => (
                  <li key={item}>
                    <button type="button" onClick={() => send(item)} disabled={streaming}>
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="chat-side-foot">
          <Link href="/" className="chat-side-home">← Back to KastoChha</Link>
        </div>
      </aside>

      <main className="chat-main" id="main">
        <header className="chat-topbar">
          {/* Doubles as the way home: the sidebar (with its own back link) is
              hidden below 860px, so on mobile this is the only exit. */}
          <Link href="/" className="chat-topbar-title" aria-label="KastoChha home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kastochha-logo.svg" alt="KastoChha" className="chat-topbar-logo" />
            <span className="chat-topbar-tag">Assist</span>
          </Link>
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
                        <span className="chat-typing">
                          <span></span>
                          <span></span>
                          <span></span>
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

        <div className="chat-composer">
          {locked ? (
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
          ) : null}

          <form className="chat-composer-form" onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              className="chat-input"
              rows={1}
              placeholder={
                locked
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
