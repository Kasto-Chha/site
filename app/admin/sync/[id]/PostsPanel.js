"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BODY_MAX, FESTIVALS, KINDS, KIND_LABELS, STATUSES, STATUS_LABELS } from "../../../../lib/sync/posts";

const NEXT = { idea: ["drafted", "Mark drafted"], drafted: ["waiting", "Send for the owner"], waiting: ["approved", "Owner approved"], approved: ["published", "Mark as posted"] };
const EMPTY = { title: "", body: "", kind: "update", planned_on: "", button_link: "" };

// The posts plan for one business: add a post, draft it, send it to the owner, copy it for Google, mark it posted. Typed in by hand
// until the Google connection exists. A Free business is held (posts can still be removed).
export default function PostsPanel({ merchantId, posts, disabledReason }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null); // post id, or "new"
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState("");
  const off = Boolean(disabledReason);
  const url = `/api/admin/sync/merchants/${merchantId}/posts`;

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

  const startNew = (title = "") => { setForm({ ...EMPTY, title }); setEditing("new"); };
  const startEdit = (post) => { setForm({ title: post.title, body: post.body || "", kind: post.kind, planned_on: post.planned_on || "", button_link: post.button_link || "" }); setEditing(post.id); };
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function save(event) {
    event.preventDefault();
    const ok = editing === "new" ? await call("POST", url, form, "Post added.") : await call("PATCH", url, { postId: editing, ...form }, "Post saved.");
    if (ok) setEditing(null);
  }
  const move = (post, status) => call("PATCH", url, { postId: post.id, status }, `Moved to "${STATUS_LABELS[status]}".`);
  async function copy(post) {
    try {
      await navigator.clipboard.writeText(post.body || "");
      setError(""); setMessage("Copied. Paste it into the Google post.");
    } catch {
      setMessage(""); setError("Could not copy. Select the text and copy it by hand.");
    }
  }
  async function remove(post) {
    if (removing !== post.id) { setRemoving(post.id); return; }
    setRemoving("");
    await call("DELETE", `${url}?post=${post.id}`, null, "Post removed.");
  }

  return (
    <>
      <div className="admin-panel">
        <h2>Posts</h2>
        <p className="admin-helper">What the business will put on its Google profile. Planned here and posted by hand until the Google connection is approved.</p>
        {off ? <div className="admin-banner" role="status">{disabledReason}</div> : null}
        {error ? <div className="admin-banner" role="alert">{error}</div> : null}
        {message ? <div className="admin-banner" role="status">{message}</div> : null}
        <div className="admin-actions">
          <button type="button" className="btn-red" disabled={off || busy} onClick={() => (editing === "new" ? setEditing(null) : startNew())}>{editing === "new" ? "Close the form" : "Add a post"}</button>
        </div>
        <p className="admin-helper">Ideas for a festival (check the date each year, they move):</p>
        <div className="admin-actions">
          {FESTIVALS.map((name) => <button key={name} type="button" className="btn-outline" disabled={off || busy} onClick={() => startNew(`${name} greeting`)}>{name}</button>)}
        </div>
      </div>

      {editing ? (
        <form className="admin-panel" onSubmit={save}>
          <h2>{editing === "new" ? "New post" : "Edit post"}</h2>
          <div className="admin-field"><label className="admin-label" htmlFor="p-title">Title (for the team only)</label><input id="p-title" className="admin-input" value={form.title} onChange={set("title")} maxLength={120} autoComplete="off" /></div>
          <div className="admin-field"><label className="admin-label" htmlFor="p-kind">Kind</label><select id="p-kind" className="admin-select" value={form.kind} onChange={set("kind")}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}</select></div>
          <div className="admin-field"><label className="admin-label" htmlFor="p-day">Planned day</label><input id="p-day" type="date" className="admin-input" value={form.planned_on} onChange={set("planned_on")} /></div>
          <div className="admin-field"><label className="admin-label" htmlFor="p-body">The post, as it will appear on Google</label><textarea id="p-body" className="admin-input" rows={6} value={form.body} onChange={set("body")} maxLength={BODY_MAX} /><div className="admin-helper">{form.body.length} of {BODY_MAX} characters</div></div>
          <div className="admin-field"><label className="admin-label" htmlFor="p-link">Button link (optional, https only)</label><input id="p-link" className="admin-input" inputMode="url" value={form.button_link} onChange={set("button_link")} autoComplete="off" /></div>
          <div className="admin-actions">
            <button type="submit" className="btn-red" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-outline" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      ) : null}

      {posts.length === 0 ? <div className="admin-panel"><p className="admin-helper">No posts yet.</p></div> : null}
      {STATUSES.map((status) => {
        const list = posts.filter((p) => p.status === status);
        if (list.length === 0) return null;
        return (
          <div className="admin-panel" key={status}>
            <h2>{STATUS_LABELS[status]} ({list.length})</h2>
            <div className="admin-list">
              {list.map((post) => (
                <div className="admin-row" key={post.id}>
                  <div>
                    <div className="admin-row-title">{post.title}</div>
                    <div className="admin-row-meta">{KIND_LABELS[post.kind]}{post.planned_on ? ` · planned ${post.planned_on}` : " · no day yet"}{post.published_on ? ` · posted ${post.published_on}` : ""}</div>
                    {post.owner_note && post.status === "drafted" ? <div className="admin-row-meta"><strong>Owner asked for a change:</strong> {post.owner_note}</div> : null}
                    {post.body ? <div className="admin-row-meta">{post.body.length > 140 ? `${post.body.slice(0, 140)}…` : post.body}</div> : null}
                  </div>
                  <div className="admin-row-actions">
                    {NEXT[post.status] ? <button type="button" className="btn-red" disabled={off || busy} onClick={() => move(post, NEXT[post.status][0])}>{NEXT[post.status][1]}</button> : null}
                    {post.body ? <button type="button" className="btn-outline" disabled={busy} onClick={() => copy(post)}>Copy for Google</button> : null}
                    <button type="button" className="btn-outline" disabled={off || busy} onClick={() => startEdit(post)}>Edit</button>
                    {post.status !== "idea" ? <button type="button" className="btn-outline" disabled={off || busy} onClick={() => move(post, "idea")}>Back to idea</button> : null}
                    <button type="button" className="btn-outline" disabled={busy} onClick={() => remove(post)}>{removing === post.id ? "Really remove" : "Remove"}</button>
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
