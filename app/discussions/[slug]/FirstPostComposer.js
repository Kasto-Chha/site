"use client";

import { useState } from "react";
import { revealWhenPresent } from "../../../lib/revealNew";
import { useRouter } from "next/navigation";

import GoogleCopyCard from "./GoogleCopyCard";
import useRequireSignIn from "../../components/useRequireSignIn";
import { verdictTone } from "../../../lib/topics";

const VERDICT_OPTIONS = ["Ramro chha", "Thikai chha", "Naramro chha"];

// The first post on a business thread that has none yet. An ordinary thread's box needs a
// first post to exist (it reuses that post's title), so an empty business thread has this
// instead. It posts under `postTitle`, the title pinned when the business was tagged: that
// is the title that makes the thread's own address, so the post lands in this thread and
// not in a new one. Once it is posted the page refreshes into the ordinary thread view.
export default function FirstPostComposer({ slug, postTitle, category, businessName, businessSlug = "", googleUrl = "" }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [verdict, setVerdict] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // The words just posted, held so the "copy my text and open Google" offer can use them.
  const [posted, setPosted] = useState("");

  const requireSignIn = useRequireSignIn({
    draftKey: `thread:${slug}`,
    onRestore: (draft) => {
      setText(draft?.summary || "");
      setVerdict(draft?.verdict || "");
    }
  });

  async function send(summary, chosenVerdict) {
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: postTitle, category, verdict: chosenVerdict || "", summary })
      });

      // Not signed in: open Clerk over this page and post the same words once they are through.
      if (response.status === 401) {
        requireSignIn(() => send(summary, chosenVerdict), { summary, verdict: chosenVerdict });
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data?.error || "Could not post your experience. Try again.");
        return;
      }
      const saved = await response.json().catch(() => ({}));
      setText("");
      setVerdict("");
      // A business with a Google link gets the offer before the page changes under the visitor, and the offer is what to
      // bring into view; otherwise the page refreshes and the new post is.
      if (googleUrl) {
        setPosted(summary);
        revealWhenPresent("google-copy-card");
      } else {
        router.refresh();
        if (saved?.review?.id) revealWhenPresent(`exp-${saved.review.id}`);
      }
    } catch {
      setError("Could not post your experience. Try again.");
    } finally {
      setSending(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    const summary = text.trim();
    if (!summary) {
      setError("Write your experience first.");
      return;
    }
    send(summary, verdict);
  }

  if (posted) {
    return (
      <div id="share">
        <GoogleCopyCard text={posted} googleUrl={googleUrl} businessSlug={businessSlug} onClose={() => router.refresh()} />
        <p>
          <button type="button" className="biz-btn" onClick={() => router.refresh()}>See the discussion</button>
        </p>
      </div>
    );
  }

  return (
    <section className="biz-first" id="share">
      <h2>Be the first to share your experience</h2>
      <p>Been to {businessName}? Tell Nepal what it is really like.</p>
      <form className="thread-composer" onSubmit={submit}>
        <textarea
          className="thread-composer-input"
          placeholder={`Share your experience at "${businessName}"...`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          autoComplete="off"
        />
        <div className="thread-composer-row">
          <div className="thread-verdicts">
            {VERDICT_OPTIONS.map((option) => (
              <button
                type="button"
                key={option}
                className={`thread-verdict ${verdictTone(option)} ${verdict === option ? "on" : ""}`}
                onClick={() => setVerdict((prev) => (prev === option ? "" : option))}
              >
                {option}
              </button>
            ))}
          </div>
          <button type="submit" className="thread-composer-send" disabled={sending}>
            {sending ? "Posting..." : "Post ->"}
          </button>
        </div>
        {error ? <div className="form-error">{error}</div> : null}
      </form>
    </section>
  );
}
