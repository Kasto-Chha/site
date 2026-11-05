"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import useRequireSignIn from "../../components/useRequireSignIn";

// The box for a question about a business. A question is an ordinary post of kind "question" in the
// business's own thread (the title is the thread's pinned title, so it lands in the right thread),
// and anyone who knows can answer it with an experience. It is closed on a page that already has
// posts, so it does not push them down, and opens when the page's address ends in #ask (which is
// where the hub's "Ask a question" and the page's own button lead).
export default function AskComposer({ slug, postTitle, category, businessName, defaultOpen = false }) {
  const router = useRouter();
  const box = useRef(null);
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const requireSignIn = useRequireSignIn({
    draftKey: `ask:${slug}`,
    onRestore: (draft) => {
      setText(draft?.summary || "");
      setOpen(true);
    }
  });

  useEffect(() => {
    function check() {
      if (window.location.hash === "#ask") {
        setOpen(true);
        box.current?.scrollIntoView?.({ block: "start" });
      }
    }
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  async function send(summary) {
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: postTitle, category, kind: "question", verdict: "", summary })
      });
      // Not signed in: open Clerk over this page and ask the same question once they are through.
      if (response.status === 401) {
        requireSignIn(() => send(summary), { summary });
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data?.error || "Could not post your question. Try again.");
        return;
      }
      setText("");
      router.refresh();
    } catch {
      setError("Could not post your question. Try again.");
    } finally {
      setSending(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    const summary = text.trim();
    if (!summary) {
      setError("Write your question first.");
      return;
    }
    send(summary);
  }

  return (
    <section className="biz-ask" id="ask" ref={box}>
      {!open ? (
        <button type="button" className="biz-btn" onClick={() => setOpen(true)}>
          Ask a question about {businessName}
        </button>
      ) : (
        <form className="thread-composer" onSubmit={submit}>
          <h2>Ask a question</h2>
          <p>What do you want to know about {businessName}? The business can reply here, and people who have been can share what they know below.</p>
          <textarea
            className="thread-composer-input"
            placeholder="For example: Is it quiet enough to work there in the afternoon?"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            autoComplete="off"
          />
          <div className="thread-composer-row">
            <span />
            <button type="submit" className="thread-composer-send" disabled={sending}>
              {sending ? "Posting..." : "Ask ->"}
            </button>
          </div>
          {error ? <div className="form-error">{error}</div> : null}
        </form>
      )}
    </section>
  );
}
