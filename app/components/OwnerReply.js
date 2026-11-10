"use client";

import { useState } from "react";

import "./ownerReply.css";
import { REPLY_MAX, shortDate } from "../../lib/sync/ownerReplies";

// A business's reply, as everyone reads it. Not who wrote it: it is the business speaking, and the label says
// the KastoChha team has checked that the account belongs to it.
export function ReplyView({ name, reply, children }) {
  return (
    <div className="owner-reply" id={`reply-${reply.id}`}>
      <div className="owner-reply-head">
        <span className="owner-reply-name">{name}</span>
        <span className="owner-reply-badge" title="Written by the account the KastoChha team linked to this business.">Verified business</span>
        <span className="owner-reply-date">
          {shortDate(reply.created_at)}
          {reply.edited_at ? " · edited" : ""}
        </span>
      </div>
      <p className="owner-reply-text">{reply.body}</p>
      {children}
    </div>
  );
}

// Under one post on a business's page: the business's reply if there is one, and, for the linked owner only,
// the way to write, edit or delete it. A team member can remove a reply. Everyone else sees the reply and
// nothing to press. Nothing here decides who may do what: the server does, on every request.
export default function OwnerReplyBlock({ exp, ownerThread }) {
  const { name, canReply, canModerate, replies, save, edit, remove } = ownerThread;
  const reply = replies[exp.id] || null;
  const [mode, setMode] = useState("idle"); // idle | writing | editing | confirming
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!reply && !canReply) return null;

  async function run(action, done) {
    setBusy(true);
    setError("");
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    done();
  }

  const finish = () => {
    setMode("idle");
    setText("");
  };

  function submit(event) {
    event.preventDefault();
    if (!text.trim()) {
      setError("Write your reply first.");
      return;
    }
    if (mode === "writing") run(() => save(exp.id, text), finish);
    else run(() => edit(reply.id, text), finish);
  }

  const form = (
    <form className="owner-reply-form" onSubmit={submit}>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={REPLY_MAX}
        rows={3}
        placeholder={`Reply as ${name}`}
        aria-label={`Reply as ${name}`}
        autoComplete="off"
      />
      <div className="owner-reply-actions">
        <button type="submit" className="thread-composer-send" disabled={busy}>
          {busy ? "Saving..." : mode === "writing" ? "Post reply" : "Save"}
        </button>
        <button type="button" className="exp-action" onClick={finish} disabled={busy}>Cancel</button>
        <span className="owner-reply-count">{text.length.toLocaleString("en-US")} / {REPLY_MAX.toLocaleString("en-US")}</span>
      </div>
      {error ? <div className="form-error">{error}</div> : null}
    </form>
  );

  if (!reply) {
    return mode === "writing" ? (
      <div className="owner-reply">{form}</div>
    ) : (
      <div className="owner-reply-start">
        <button type="button" className="exp-action" onClick={() => setMode("writing")}>Reply as {name}</button>
      </div>
    );
  }

  if (mode === "editing") return <div className="owner-reply">{form}</div>;

  return (
    <ReplyView name={name} reply={reply}>
      {canReply || canModerate ? (
        <div className="owner-reply-actions">
          {canReply && mode === "idle" ? (
            <>
              <button type="button" className="exp-action" onClick={() => { setText(reply.body); setMode("editing"); }}>Edit</button>
              <button type="button" className="exp-action is-danger" onClick={() => setMode("confirming")}>Delete</button>
            </>
          ) : null}
          {!canReply && canModerate && mode === "idle" ? (
            <button type="button" className="exp-action is-danger" onClick={() => setMode("confirming")}>Remove</button>
          ) : null}
          {mode === "confirming" ? (
            <>
              <span>{canReply ? "Delete this reply?" : "Remove this reply?"}</span>
              <button type="button" className="exp-action is-danger" disabled={busy} onClick={() => run(() => remove(reply.id), finish)}>{busy ? "Working..." : "Yes"}</button>
              <button type="button" className="exp-action" disabled={busy} onClick={finish}>No</button>
            </>
          ) : null}
        </div>
      ) : null}
      {error ? <div className="form-error">{error}</div> : null}
    </ReplyView>
  );
}
