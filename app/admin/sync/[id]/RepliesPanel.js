"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { DRAFT_MAX, REVIEW_MAX, STATUSES, STATUS_LABELS } from "../../../../lib/sync/replies";

const NEXT = { new: ["drafted", "Mark drafted"], asking: ["drafted", "Owner answered: mark drafted"], drafted: ["waiting", "Send for the owner"], waiting: ["approved", "Owner approved"], approved: ["posted", "Mark as posted"] };
const CAN_ASK = new Set(["new", "drafted"]);
const EMPTY = { reviewer: "", stars: "", review: "", review_on: "", draft: "" };

// The replies queue for one business: add a review that needs an answer, write the draft, ask the owner for the facts, send the draft
// for the owner's approval, copy it for Google, mark it posted. Typed in by hand until the Google connection is approved.
export default function RepliesPanel({ merchantId, replies, disabledReason }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null); // reply id, or "new"
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState("");
  const off = Boolean(disabledReason);
  const url = `/api/admin/sync/merchants/${merchantId}/replies`;

  async function call(method, target, body, done) {
    if (busy) return false;
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch(target, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That did not work.");
      setMessage(done);
      router.refresh();
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const startEdit = (r) => { setForm({ reviewer: r.reviewer, stars: r.stars ? String(r.stars) : "", review: r.review || "", review_on: r.review_on || "", draft: r.draft || "" }); setEditing(r.id); };
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function save(event) {
    event.preventDefault();
    const ok = editing === "new" ? await call("POST", url, form, "Review added.") : await call("PATCH", url, { replyId: editing, ...form }, "Saved.");
    if (ok) setEditing(null);
  }
  const move = (r, status) => call("PATCH", url, { replyId: r.id, status }, `Moved to "${STATUS_LABELS[status]}".`);
  async function copy(r) {
    try {
      await navigator.clipboard.writeText(r.draft || "");
      setError(""); setMessage("Copied. Paste it into the reply box on Google.");
    } catch {
      setMessage(""); setError("Could not copy. Select the text and copy it by hand.");
    }
  }
  async function remove(r) {
    if (removing !== r.id) { setRemoving(r.id); return; }
    setRemoving("");
    await call("DELETE", `${url}?reply=${r.id}`, null, "Removed.");
  }

  return (
    <>
      <div className="admin-panel">
        <h2>Replies</h2>
        <p className="admin-helper">Reviews on the Google profile that need an answer. Paste the review here, write the reply, ask the owner when we need a fact, and post it on Google by hand until the connection is approved. Reply to every review, good and bad, within 48 hours.</p>
        {off ? <div className="admin-banner" role="status">{disabledReason}</div> : null}
        {error ? <div className="admin-banner" role="alert">{error}</div> : null}
        {message ? <div className="admin-banner" role="status">{message}</div> : null}
        <div className="admin-actions">
          <button type="button" className="btn-red" disabled={off || busy} onClick={() => { if (editing === "new") setEditing(null); else { setForm(EMPTY); setEditing("new"); } }}>{editing === "new" ? "Close the form" : "Add a review"}</button>
        </div>
      </div>

      {editing ? (
        <form className="admin-panel" onSubmit={save}>
          <h2>{editing === "new" ? "New review" : "Edit"}</h2>
          <div className="admin-field"><label className="admin-label" htmlFor="r-name">Reviewer, as Google shows the name</label><input id="r-name" className="admin-input" value={form.reviewer} onChange={set("reviewer")} maxLength={80} autoComplete="off" /></div>
          <div className="admin-field"><label className="admin-label" htmlFor="r-stars">Stars</label><select id="r-stars" className="admin-select" value={form.stars} onChange={set("stars")}><option value="">Not known</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
          <div className="admin-field"><label className="admin-label" htmlFor="r-day">Day of the review</label><input id="r-day" type="date" className="admin-input" value={form.review_on} onChange={set("review_on")} /></div>
          <div className="admin-field"><label className="admin-label" htmlFor="r-review">The review</label><textarea id="r-review" className="admin-input" rows={4} value={form.review} onChange={set("review")} maxLength={REVIEW_MAX} /></div>
          <div className="admin-field"><label className="admin-label" htmlFor="r-draft">Our reply</label><textarea id="r-draft" className="admin-input" rows={5} value={form.draft} onChange={set("draft")} maxLength={DRAFT_MAX} /><div className="admin-helper">{form.draft.length} of {DRAFT_MAX} characters. Thank them, be specific, never argue, never promise what the owner has not agreed to.</div></div>
          <div className="admin-actions">
            <button type="submit" className="btn-red" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-outline" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      ) : null}

      {replies.length === 0 ? <div className="admin-panel"><p className="admin-helper">No reviews waiting.</p></div> : null}
      {STATUSES.map((status) => {
        const list = replies.filter((r) => r.status === status);
        if (list.length === 0) return null;
        return (
          <div className="admin-panel" key={status}>
            <h2>{STATUS_LABELS[status]} ({list.length})</h2>
            <div className="admin-list">
              {list.map((r) => (
                <div className="admin-row" key={r.id}>
                  <div>
                    <div className="admin-row-title">{r.reviewer}{r.stars ? ` · ${r.stars} ${r.stars === 1 ? "star" : "stars"}` : ""}</div>
                    <div className="admin-row-meta">{r.review_on ? `Review of ${r.review_on}` : "No review day"}{r.posted_on ? ` · replied ${r.posted_on}` : ""}</div>
                    {r.review ? <div className="admin-row-meta">“{r.review.length > 160 ? `${r.review.slice(0, 160)}…` : r.review}”</div> : null}
                    {r.draft ? <div className="admin-row-meta">Reply: {r.draft.length > 160 ? `${r.draft.slice(0, 160)}…` : r.draft}</div> : null}
                  </div>
                  <div className="admin-row-actions">
                    {NEXT[r.status] ? <button type="button" className="btn-red" disabled={off || busy} onClick={() => move(r, NEXT[r.status][0])}>{NEXT[r.status][1]}</button> : null}
                    {CAN_ASK.has(r.status) ? <button type="button" className="btn-outline" disabled={off || busy} onClick={() => move(r, "asking")}>Ask the owner</button> : null}
                    {r.draft ? <button type="button" className="btn-outline" disabled={busy} onClick={() => copy(r)}>Copy for Google</button> : null}
                    <button type="button" className="btn-outline" disabled={off || busy} onClick={() => startEdit(r)}>Edit</button>
                    {r.status !== "new" ? <button type="button" className="btn-outline" disabled={off || busy} onClick={() => move(r, "new")}>Back to new</button> : null}
                    <button type="button" className="btn-outline" disabled={busy} onClick={() => remove(r)}>{removing === r.id ? "Really remove" : "Remove"}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
