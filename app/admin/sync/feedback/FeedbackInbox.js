"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { DigestCard, FeedbackNote } from "./FeedbackParts";
import { forwardText } from "../../../../lib/sync/feedback";

// The inbox's buttons. The notes come first (the urgent ones are on top: that is what the team triages), then the
// digests to send, as in the design. Nothing is kept here: every change goes to the server, and then the page is read again
// from it, so the list, the tabs' counts and the digests can never disagree with the database.
export default function FeedbackInbox({ notes, digests }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState({});

  async function call(url, method, body) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "That did not work.");
    return data;
  }

  async function run(key, action) {
    setBusy(key);
    setMessage("");
    try {
      await action();
      router.refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  // A task for this business, started from the note: the note's words are its details and the note stays as it is. The
  // customer's contact details are not copied, only what they wrote.
  async function makeTask(note) {
    setBusy(note.id);
    setMessage("");
    try {
      const line = String(note.message || "").replace(/\s+/g, " ").trim();
      await call("/api/admin/sync/tasks", "POST", {
        merchantId: note.business.id,
        title: `Private note: ${line.length > 90 ? `${line.slice(0, 89)}…` : line}`,
        details: note.message,
        type: "other",
        source: "note",
        sourceNoteId: note.id
      });
      setCopied((c) => ({ ...c, [note.id]: "Task made. It is on the Tasks page." }));
      setTimeout(() => setCopied((c) => ({ ...c, [note.id]: "" })), 4000);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  async function copy(key, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied((c) => ({ ...c, [key]: "Copied." }));
    } catch {
      setCopied((c) => ({ ...c, [key]: "Could not copy. Select the text and copy it." }));
    }
    setTimeout(() => setCopied((c) => ({ ...c, [key]: "" })), 2500);
  }

  return (
    <>
      {message ? <div className="ov-banner" role="alert">{message}</div> : null}

      <section className="ov-section">
        <h2>Notes</h2>
        {notes.length === 0 ? <div className="ov-card ov-empty">No notes here.</div> : null}
        {notes.map((note) => (
          <FeedbackNote
            key={note.id}
            note={note}
            age={note.age}
            busy={busy === note.id}
            copied={copied[note.id]}
            onCopy={() => copy(note.id, forwardText({ businessName: note.business?.business_name ?? "this business", note }))}
            onTask={makeTask}
            onStatus={(n, status) => run(n.id, () => call(`/api/admin/sync/feedback/${n.id}`, "PUT", { status }))}
          />
        ))}
      </section>

      {digests.length > 0 ? (
        <section className="ov-section">
          <h2>Digests to send</h2>
          {digests.map((digest) => (
            <DigestCard
              key={digest.merchantId}
              digest={digest}
              busy={busy === digest.merchantId}
              copied={copied[digest.merchantId]}
              onCopy={() => copy(digest.merchantId, digest.text)}
              onSent={() => run(digest.merchantId, () => call("/api/admin/sync/feedback/digest", "POST", { merchantId: digest.merchantId }))}
            />
          ))}
        </section>
      ) : null}
    </>
  );
}
