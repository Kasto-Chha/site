"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { formatTimeAgo } from "../../lib/topics";

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

export default function ChatClient({
  history = [],
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
  const [historyItems, setHistoryItems] = useState(history);
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

  const nextId = () => {
    idRef.current += 1;
    return `m${idRef.current}`;
  };

  const updateMessage = (id, content) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content } : m))
    );
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
          messages: base.map(({ role, content }) => ({ role, content }))
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

      // Add this question to the visible history using the id the server logged.
      const savedId = response.headers.get("X-Chat-Query-Id");
      if (savedId) {
        setHistoryItems((prev) => {
          const next = prev.filter((item) => item.id !== savedId);
          return [{ id: savedId, query: content, created_at: new Date().toISOString() }, ...next];
        });
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
  // release the lock and retire the trial counter.
  useEffect(() => {
    if (!isSignedIn) return;
    setSignUpRequired(false);
    setTrialLeft(null);
  }, [isSignedIn]);

  // Keep the conversation scrolled to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

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
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/chat");
    }
    textareaRef.current?.focus();
  };

  const deleteHistoryItem = async (id) => {
    const prev = historyItems;
    setHistoryItems((items) => items.filter((item) => item.id !== id));
    try {
      const response = await fetch("/api/chat/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id })
      });
      if (!response.ok) setHistoryItems(prev); // revert on failure
    } catch {
      setHistoryItems(prev);
    }
  };

  const clearHistory = async () => {
    if (clearing || historyItems.length === 0) return;
    const prev = historyItems;
    setClearing(true);
    setHistoryItems([]);
    try {
      const response = await fetch("/api/chat/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ all: true })
      });
      if (!response.ok) setHistoryItems(prev);
    } catch {
      setHistoryItems(prev);
    } finally {
      setClearing(false);
    }
  };

  const railPrompts = Array.from(new Set([...prompts, ...recent]))
    .filter(Boolean)
    .slice(0, 6);

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

          {historyItems.length > 0 ? (
            <div className="chat-side-block">
              <div className="chat-side-head">
                <span className="chat-side-label">Your history</span>
                <button
                  type="button"
                  className="chat-history-clear"
                  onClick={clearHistory}
                  disabled={clearing}
                >
                  Clear all
                </button>
              </div>
              <ul className="chat-history-list">
                {historyItems.map((item) => (
                  <li key={item.id} className="chat-history-item">
                    <button
                      type="button"
                      className="chat-history-open"
                      onClick={() => send(item.query)}
                      disabled={streaming}
                      title={item.query}
                    >
                      <span className="chat-history-q">{item.query}</span>
                      {item.created_at ? (
                        <span className="chat-history-time">
                          {formatTimeAgo(item.created_at)}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="chat-history-del"
                      onClick={() => deleteHistoryItem(item.id)}
                      aria-label="Delete from history"
                      title="Delete"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
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
                      ) : (
                        message.content
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
