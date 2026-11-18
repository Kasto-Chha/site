"use client";

import { useState } from "react";

const NOTE_MAX = 300;
const ANSWER_MAX = 1000;
const KIND_WORD = { menu: "menu item", post: "post", reply: "reply" };

async function send(url, body) {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: data.error || "Could not save. Please try again." };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Could not reach the server. Please try again." };
  }
}

// One thing waiting for the owner: shows it, then "Looks right" or "Needs a change" with a short comment.
function Decision({ businessId, kind, id, children, onDone }) {
  const [mode, setMode] = useState("idle");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go(decision) {
    setBusy(true);
    setError("");
    const result = await send(`/api/owner/merchants/${businessId}/review`, { kind, id, decision, note: decision === "change" ? note : undefined });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onDone(decision === "approve" ? "Approved. Thank you." : "Sent back to our team with your comment.");
  }
  return (
    <div className="ow-card">
      {children}
      {error ? <p role="alert" className="ow-error">{error}</p> : null}
      {mode === "idle" ? (
        <div className="ow-actions">
          <button type="button" className="ow-primary" disabled={busy} onClick={() => go("approve")}>Looks right</button>
          <button type="button" className="ow-secondary" disabled={busy} onClick={() => setMode("change")}>Needs a change</button>
        </div>
      ) : (
        <div>
          <label className="ow-label" htmlFor={`n-${id}`}>What should change?</label>
          <textarea id={`n-${id}`} className="ow-area" rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="ow-fine">{note.length} of {NOTE_MAX} characters</div>
          <div className="ow-actions">
            <button type="button" className="ow-primary" disabled={busy || !note.trim()} onClick={() => go("change")}>Send back</button>
            <button type="button" className="ow-secondary" disabled={busy} onClick={() => setMode("idle")}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Question({ businessId, q }) {
  const [text, setText] = useState(q.answer || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(Boolean(q.answer));
  async function go() {
    setBusy(true);
    setError("");
    const result = await send(`/api/owner/merchants/${businessId}/answer`, { id: q.id, answer: text });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
  }
  return (
    <div className="ow-card">
      <strong>{q.reviewer || "A customer"}{q.stars ? ` · ${q.stars} star${q.stars === 1 ? "" : "s"}` : ""}{q.review_on ? ` · ${q.review_on}` : ""}</strong>
      <p className="ow-text">“{q.review}”</p>
      <div className="ow-notice ow-card">
        <div className="ow-urgent">WHAT WE NEED TO KNOW</div>
        <p className="ow-text">{q.question}</p>
      </div>
      <label className="ow-label" htmlFor={`a-${q.id}`}>Your answer</label>
      <textarea id={`a-${q.id}`} className="ow-area" rows={5} maxLength={ANSWER_MAX} value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} />
      <div className="ow-fine">{text.length} of {ANSWER_MAX} characters</div>
      {error ? <p role="alert" className="ow-error">{error}</p> : null}
      {saved ? <p role="status" className="ow-ok">Sent to our team. They will write the reply and send it back to you to approve before anything is posted.</p> : null}
      <div className="ow-actions">
        <button type="button" className="ow-primary" disabled={busy || !text.trim() || saved} onClick={go}>{q.answer ? "Send my new answer" : "Send my answer to the team"}</button>
      </div>
    </div>
  );
}

export default function NeedsYou({ businessId, needs }) {
  const [gone, setGone] = useState({});
  const [messages, setMessages] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const done = (key, message) => {
    setGone((g) => ({ ...g, [key]: true }));
    setMessages((m) => [...m, message]);
  };
  async function approveAll() {
    setBulkBusy(true);
    setBulkError("");
    const result = await send(`/api/owner/merchants/${businessId}/review`, { kind: "menu", decision: "approve_all" });
    setBulkBusy(false);
    if (!result.ok) return setBulkError(result.error);
    const all = {};
    for (const item of needs.menu) all[`menu-${item.id}`] = true;
    setGone((g) => ({ ...g, ...all }));
    setMessages((m) => [...m, `All ${result.data.changed} menu items approved.`]);
  }
  const menu = needs.menu.filter((i) => !gone[`menu-${i.id}`]);
  const posts = needs.posts.filter((i) => !gone[`post-${i.id}`]);
  const replies = needs.replies.filter((i) => !gone[`reply-${i.id}`]);
  const nothing = menu.length + posts.length + replies.length + needs.questions.length === 0;
  return (
    <>
      {messages.map((m, i) => <p key={i} role="status" className="ow-ok">{m}</p>)}
      {nothing ? <div className="ow-card"><p>Nothing is waiting for you right now. Thank you.</p></div> : null}

      {needs.questions.length > 0 ? <h2 className="ow-h2">A question from us</h2> : null}
      {needs.questions.map((q) => <Question key={q.id} businessId={businessId} q={q} />)}

      {replies.length > 0 ? <h2 className="ow-h2">Replies to check</h2> : null}
      {replies.map((r) => (
        <Decision key={r.id} businessId={businessId} kind="reply" id={r.id} onDone={(m) => done(`reply-${r.id}`, m)}>
          <strong>{r.reviewer || "A customer"}{r.stars ? ` · ${r.stars} star${r.stars === 1 ? "" : "s"}` : ""}</strong>
          <p className="ow-text">“{r.review}”</p>
          <div className="ow-sub">Our reply, ready to post:</div>
          <p className="ow-text">{r.draft}</p>
        </Decision>
      ))}

      {posts.length > 0 ? <h2 className="ow-h2">Posts to check</h2> : null}
      {posts.map((p) => (
        <Decision key={p.id} businessId={businessId} kind="post" id={p.id} onDone={(m) => done(`post-${p.id}`, m)}>
          <div className="ow-sub">{p.kind}{p.planned_on ? ` · planned ${p.planned_on}` : ""}</div>
          <p className="ow-text">{p.body}</p>
          {p.button_link ? <div className="ow-sub">Button goes to: {p.button_link}</div> : null}
        </Decision>
      ))}

      {menu.length > 0 ? (
        <>
          <h2 className="ow-h2">Menu items to check</h2>
          {menu.length > 1 ? (
            <div className="ow-card">
              <button type="button" className="ow-primary" disabled={bulkBusy} onClick={approveAll}>All {menu.length} look right</button>
              {bulkError ? <p role="alert" className="ow-error">{bulkError}</p> : null}
            </div>
          ) : null}
        </>
      ) : null}
      {menu.map((i) => (
        <Decision key={i.id} businessId={businessId} kind="menu" id={i.id} onDone={(m) => done(`menu-${i.id}`, m)}>
          <strong>{i.name}</strong>
          <div className="ow-sub">{[i.section, i.price !== null && i.price !== "" ? `${i.price}${i.unit ? ` ${i.unit}` : ""}` : ""].filter(Boolean).join(" · ")}</div>
          {i.description ? <p className="ow-text">{i.description}</p> : null}
        </Decision>
      ))}
      <p className="ow-fine">Nothing is posted to Google until you approve it and our team publishes it. Your {KIND_WORD.menu}, post and reply comments go to our team only.</p>
    </>
  );
}
