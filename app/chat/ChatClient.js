"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const SUGGESTIONS = [
  "Ncell vs NTC — kun ramro?",
  "Is the iPhone 16 worth it in Nepal?",
  "Best banks for a savings account",
  "Tips before renting a flat in Kathmandu"
];

export default function ChatClient({ recent = [], prompts = [] }) {
  const searchParams = useSearchParams();
  const initialQuery = (searchParams.get("q") || "").trim();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

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
    if (!content || streaming) return;

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

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        updateMessage(
          assistantMsg.id,
          data?.error || "Sorry, something went wrong. Please try again."
        );
        return;
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

  const railPrompts = Array.from(new Set([...prompts, ...recent]))
    .filter(Boolean)
    .slice(0, 6);

  const isEmpty = messages.length === 0;

  return (
    <div className="chat-app">
      <aside className="chat-sidebar">
        <div className="chat-side-top">
          <Link href="/" className="chat-logo">
            Kasto<em>Chha</em>
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

        <div className="chat-side-foot">
          <Link href="/" className="chat-side-home">← Back to KastoChha</Link>
        </div>
      </aside>

      <main className="chat-main" id="main">
        <header className="chat-topbar">
          <div className="chat-topbar-title">
            <span className="chat-spark" aria-hidden="true">✦</span>
            KastoChha Assist
          </div>
          <div className="chat-topbar-badge">Powered by AI · Nepal-first</div>
        </header>

        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-inner">
            {isEmpty ? (
              <div className="chat-welcome">
                <div className="chat-welcome-spark" aria-hidden="true">✦</div>
                <h1 className="chat-welcome-title">
                  Namaste! <em>Kasto chha?</em>
                </h1>
                <p className="chat-welcome-sub">
                  Ask anything about products, places, careers, or life in Nepal.
                  Answers are grounded in real community experiences.
                </p>
                <div className="chat-suggests">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="chat-suggest"
                      onClick={() => send(s)}
                    >
                      {s}
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
          <form className="chat-composer-form" onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              className="chat-input"
              rows={1}
              placeholder="Ask KastoChha Assist anything..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="submit"
              className="chat-send"
              disabled={streaming || !input.trim()}
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
