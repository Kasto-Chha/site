"use client";

import { useState } from "react";

import { CONTACT_MAX, NOTE_MAX } from "../../../../lib/sync/feedback";

// The form for a private note. No login: a customer at a table should be able to say "the washroom was not
// clean" without making an account. It sends words and, if the person chooses, a way to reach them. The
// extra field named "website" is not for people: it is hidden, and a program that fills in every field
// fills it in and is quietly ignored.
export default function NoteForm({ slug, name }) {
  const [note, setNote] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState("writing"); // writing | sending | sent
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!note.trim()) {
      setError("Write your note first.");
      return;
    }
    setState("sending");
    setError("");
    try {
      const response = await fetch("/api/sync/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, note, contact, website })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data?.error || "Could not send your note. Please try again.");
        setState("writing");
        return;
      }
      setState("sent");
    } catch {
      setError("Could not send your note. Please try again.");
      setState("writing");
    }
  }

  if (state === "sent") {
    return (
      <div className="hub-note-done" role="status">
        <h2>Thank you.</h2>
        <p>Your note is on its way to the team at {name}. It is private: it will not be posted anywhere.</p>
        <a className="hub-action" href={`/hub/${slug}`}>
          <span>
            <b>Back to the options</b>
            <small>Share an experience, ask a question, and more</small>
          </span>
          <span className="hub-arrow" aria-hidden="true">&rsaquo;</span>
        </a>
      </div>
    );
  }

  return (
    <form className="hub-note-form" onSubmit={submit}>
      <label htmlFor="note-text">Your note</label>
      <textarea
        id="note-text"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={NOTE_MAX}
        rows={6}
        placeholder="For example: the washroom was not clean on Saturday evening."
        autoComplete="off"
      />
      <div className="hub-note-count">{note.length.toLocaleString("en-US")} / {NOTE_MAX.toLocaleString("en-US")}</div>

      <label htmlFor="note-contact">How can we reach you? (optional)</label>
      <input
        id="note-contact"
        type="text"
        value={contact}
        onChange={(event) => setContact(event.target.value)}
        maxLength={CONTACT_MAX}
        placeholder="Phone or email, if you want a reply"
        autoComplete="off"
      />

      <div className="hub-hp" aria-hidden="true">
        <label htmlFor="note-website">Leave this empty</label>
        <input id="note-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
      </div>

      {error ? <div className="hub-note-error" role="alert">{error}</div> : null}
      <button type="submit" className="hub-send" disabled={state === "sending"}>
        {state === "sending" ? "Sending..." : "Send privately"}
      </button>
      <p className="hub-note-fine">
        Only {name} and the KastoChha team can read this. It is never posted. If you leave a way to reach you, they may use it to reply.
      </p>
    </form>
  );
}
