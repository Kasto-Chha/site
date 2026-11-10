"use client";

import { useState } from "react";

import { copyAndOpenGoogle } from "../../../lib/sync/googleCopy";

// Shown after someone has posted on a business's page, when the business has a Google review link.
// Google's review box cannot be filled in for anyone, and KastoChha does not post on a person's
// behalf, so this does the one useful thing: puts their own words on the clipboard and opens the
// box, so they can paste. It is an offer, never a step: "Not now" is as easy as the button.
function report(slug) {
  try {
    if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
    navigator.sendBeacon("/api/sync/event", new Blob([JSON.stringify({ slug, type: "google_copy" })], { type: "application/json" }));
  } catch {
    // Counting is an aid, never a gate.
  }
}

export default function GoogleCopyCard({ text, googleUrl, businessSlug, onClose }) {
  const [message, setMessage] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  // Copy first, wait for it, then open Google (see copyAndOpenGoogle for why that order).
  async function go() {
    setBusy(true);
    const copied = await copyAndOpenGoogle({
      text,
      url: googleUrl,
      slug: businessSlug,
      clipboard: typeof navigator === "undefined" ? null : navigator.clipboard,
      open: (...args) => window.open(...args),
      track: ({ slug }) => report(slug)
    });
    setTried(true);
    setBusy(false);
    setMessage(copied ? "Copied. Paste it into the Google box that just opened." : "Google is open, but we could not copy for you. Select your text above, copy it, and paste it there.");
  }

  return (
    <section className="biz-copy" id="google-copy-card" aria-label="Post your experience on Google too">
      <h2>Your experience is on KastoChha.</h2>
      <p>Want it on Google too? We can&apos;t post for you, because a Google review has to be written by you, on Google. But we can copy your words and open the box.</p>
      <textarea className="thread-composer-input" readOnly rows={4} value={text} aria-label="Your experience" autoComplete="off" />
      <div className="biz-copy-actions">
        <button type="button" className="biz-btn primary" onClick={go} disabled={busy}>Copy my text and open Google</button>
        <button type="button" className="biz-btn" onClick={onClose}>Not now</button>
      </div>
      {message ? <p className="biz-copy-note" role="status">{message}</p> : null}
      {tried ? (
        <p className="biz-copy-note">
          Google did not open?{" "}
          <a href={googleUrl} target="_blank" rel="noopener noreferrer">Tap here to open it.</a>
        </p>
      ) : null}
    </section>
  );
}
