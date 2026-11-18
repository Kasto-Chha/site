"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { DESCRIPTION_MAX, STATUS_LABELS, formatList, formatPrice, groupItems } from "../../../../lib/sync/menu";

const EMPTY = { section: "", name: "", description: "", price: "", unit: "" };
const STATUS_CLASS = { draft: "", waiting: "waiting", confirmed: "done" };

// The menu, rooms and rates, or services of one business: add items, put them with the owner, confirm what the owner agreed, copy the
// list out. Typed in by hand. A Free business is held (items can still be removed). `words` come from the business's family.
export default function MenuPanel({ merchantId, items, words, disabledReason }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null); // item id, or "new"
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState("");
  const off = Boolean(disabledReason);
  const url = `/api/admin/sync/merchants/${merchantId}/menu`;
  const drafts = items.filter((i) => i.status === "draft").length;
  const waiting = items.filter((i) => i.status === "waiting").length;
  const confirmed = items.filter((i) => i.status === "confirmed").length;

  async function call(method, target, body, done) {
    if (busy) return false;
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch(target, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That did not work.");
      setMessage(typeof done === "function" ? done(data) : done);
      router.refresh();
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const startEdit = (i) => { setForm({ section: i.section || "", name: i.name, description: i.description || "", price: i.price === null || i.price === undefined ? "" : String(i.price), unit: i.unit || "" }); setEditing(i.id); };
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function save(event) {
    event.preventDefault();
    const ok = editing === "new" ? await call("POST", url, form, "Added as a draft.") : await call("PATCH", url, { itemId: editing, ...form }, "Saved. A changed item goes back to draft.");
    if (ok) setEditing(null);
  }
  const bulk = (action) => call("PUT", url, { action }, (d) => (d.changed === 0 ? "Nothing to change." : `${d.changed} ${d.changed === 1 ? "item" : "items"} moved.`));
  const status = (i, next) => call("PATCH", url, { itemId: i.id, status: next }, `Moved to "${STATUS_LABELS[next]}".`);
  const move = (i, direction) => call("PATCH", url, { itemId: i.id, move: direction }, "Moved.");
  async function copy(onlyConfirmed) {
    const text = formatList(items, { onlyConfirmed });
    if (!text) { setMessage(""); setError(onlyConfirmed ? "Nothing is confirmed yet." : "Nothing to copy."); return; }
    try {
      await navigator.clipboard.writeText(text);
      setError(""); setMessage(onlyConfirmed ? "Copied the confirmed items." : "Copied the whole list.");
    } catch {
      setMessage(""); setError("Could not copy. Select the text and copy it by hand.");
    }
  }
  async function remove(i) {
    if (removing !== i.id) { setRemoving(i.id); return; }
    setRemoving("");
    await call("DELETE", `${url}?item=${i.id}`, null, "Removed.");
  }

  const groups = groupItems(items);
  return (
    <>
      <div className="admin-panel">
        <h2>{words.itemsWord}</h2>
        <p className="admin-helper">Everything this business offers, with prices. Nothing counts as final until the owner has confirmed it: add items as drafts, send them to the owner, then confirm what the owner agreed. Typed in by hand; it is our own record, not posted to Google from here.</p>
        {off ? <div className="admin-banner" role="status">{disabledReason}</div> : null}
        {error ? <div className="admin-banner" role="alert">{error}</div> : null}
        {message ? <div className="admin-banner" role="status">{message}</div> : null}
        <p>{items.length === 0 ? "Nothing listed yet." : `${drafts} draft · ${waiting} waiting for the owner · ${confirmed} confirmed`}</p>
        <div className="admin-actions">
          <button type="button" className="btn-red" disabled={off || busy} onClick={() => { if (editing === "new") setEditing(null); else { setForm(EMPTY); setEditing("new"); } }}>{editing === "new" ? "Close the form" : words.addWord}</button>
          <button type="button" className="btn-outline" disabled={off || busy || drafts === 0} onClick={() => bulk("send")}>Send all drafts for the owner</button>
          <button type="button" className="btn-outline" disabled={off || busy || waiting === 0} onClick={() => bulk("confirm")}>Owner confirmed all waiting</button>
          <button type="button" className="btn-outline" disabled={busy || items.length === 0} onClick={() => copy(true)}>Copy confirmed items</button>
          <button type="button" className="btn-outline" disabled={busy || items.length === 0} onClick={() => copy(false)}>Copy everything</button>
        </div>
      </div>

      {editing ? (
        <form className="admin-panel" onSubmit={save}>
          <h2>{editing === "new" ? words.addWord : "Edit"}</h2>
          <div className="admin-field"><label className="admin-label" htmlFor="m-name">{words.itemWord}</label><input id="m-name" className="admin-input" value={form.name} onChange={set("name")} maxLength={100} autoComplete="off" /></div>
          <div className="admin-field"><label className="admin-label" htmlFor="m-section">{words.sectionHint}</label><input id="m-section" className="admin-input" value={form.section} onChange={set("section")} maxLength={60} autoComplete="off" /></div>
          <div className="admin-field"><label className="admin-label" htmlFor="m-price">Price in rupees (leave empty if there is none)</label><input id="m-price" className="admin-input" inputMode="numeric" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value.replace(/[^0-9,]/g, "").slice(0, 12) }))} autoComplete="off" /></div>
          <div className="admin-field"><label className="admin-label" htmlFor="m-unit">Unit ({words.unitHint})</label><input id="m-unit" className="admin-input" value={form.unit} onChange={set("unit")} maxLength={40} autoComplete="off" /></div>
          <div className="admin-field"><label className="admin-label" htmlFor="m-desc">Short description (optional)</label><textarea id="m-desc" className="admin-input" rows={3} value={form.description} onChange={set("description")} maxLength={DESCRIPTION_MAX} /></div>
          <div className="admin-actions">
            <button type="submit" className="btn-red" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-outline" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      ) : null}

      {groups.map((group) => (
        <div className="admin-panel" key={group.section || "none"}>
          <h2>{group.section || words.itemsWord}</h2>
          <div className="admin-list">
            {group.items.map((i) => (
              <div className="admin-row" key={i.id}>
                <div>
                  <div className="admin-row-title">{i.name}{formatPrice(i.price, i.unit) ? ` · ${formatPrice(i.price, i.unit)}` : ""}</div>
                  {i.description ? <div className="admin-row-meta">{i.description}</div> : null}
                  <div className="admin-row-meta"><span className={`sync-pill ${STATUS_CLASS[i.status]}`}>{STATUS_LABELS[i.status]}</span></div>
                </div>
                <div className="admin-row-actions">
                  {i.status === "draft" ? <button type="button" className="btn-red" disabled={off || busy} onClick={() => status(i, "waiting")}>Send for the owner</button> : null}
                  {i.status === "waiting" ? <button type="button" className="btn-red" disabled={off || busy} onClick={() => status(i, "confirmed")}>Owner confirmed</button> : null}
                  {i.status !== "draft" ? <button type="button" className="btn-outline" disabled={off || busy} onClick={() => status(i, "draft")}>Back to draft</button> : null}
                  <button type="button" className="btn-outline" disabled={off || busy} onClick={() => move(i, "up")} aria-label={`Move ${i.name} up`}>Up</button>
                  <button type="button" className="btn-outline" disabled={off || busy} onClick={() => move(i, "down")} aria-label={`Move ${i.name} down`}>Down</button>
                  <button type="button" className="btn-outline" disabled={off || busy} onClick={() => startEdit(i)}>Edit</button>
                  <button type="button" className="btn-outline" disabled={busy} onClick={() => remove(i)}>{removing === i.id ? "Really remove" : "Remove"}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
