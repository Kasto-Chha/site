"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { COUNT_FIELDS, NOTE_MAX, monthLabel } from "../../../../lib/sync/googleNumbers";

const blank = (month) => ({ month, calls: "", directions: "", views: "", rating: "", reviews: "", note: "" });
const fromRow = (row) => ({
  month: String(row.month).slice(0, 7),
  calls: row.calls ?? "",
  directions: row.directions ?? "",
  views: row.profile_views ?? "",
  rating: row.rating ?? "",
  reviews: row.reviews ?? "",
  note: row.note ?? ""
});
const show = (value) => (value === null || value === undefined ? "-" : Number(value).toLocaleString("en-US"));

// The monthly Google figures, typed in from the Business Profile screen until the Google connection exists. Typing a month again
// replaces it. A Free business cannot have numbers entered.
export default function GoogleNumbers({ merchantId, rows, months, defaultMonth, disabledReason }) {
  const router = useRouter();
  const [form, setForm] = useState(blank(defaultMonth));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState("");
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const off = Boolean(disabledReason);

  async function call(method, query, body, done) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/sync/merchants/${merchantId}/numbers${query}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That did not work.");
      setMessage(typeof done === "function" ? done(data) : done);
      router.refresh();
    } catch (failure) {
      setError(failure.message);
    }
    setBusy(false);
  }

  const save = (event) => {
    event.preventDefault();
    call("PUT", "", form, (data) => (data.replaced ? `${monthLabel(`${form.month}-01`)} was replaced.` : `${monthLabel(`${form.month}-01`)} was saved.`));
  };

  return (
    <>
      <form className="admin-panel" onSubmit={save}>
        <h2>Google numbers for a month</h2>
        <p className="admin-helper">
          Used only until the Google connection is approved. Open the business&apos;s Business Profile screen on Google, read the Performance figures, and type them here.
          Leave a figure empty if it is not shown. Typing a month again replaces it.
        </p>
        {off ? <div className="admin-banner" role="status">{disabledReason}</div> : null}
        {error ? <div className="admin-banner" role="alert">{error}</div> : null}
        {message ? <div className="admin-banner" role="status">{message}</div> : null}
        <div className="admin-two">
          <div className="admin-field">
            <label className="admin-label" htmlFor="g-month">Month</label>
            <select id="g-month" className="admin-select" value={form.month} onChange={set("month")} disabled={off} autoComplete="off">
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          {COUNT_FIELDS.slice(0, 3).map((field) => (
            <div className="admin-field" key={field.key}>
              <label className="admin-label" htmlFor={`g-${field.key}`}>{field.label}</label>
              <input id={`g-${field.key}`} className="admin-input" inputMode="numeric" value={form[field.key]} onChange={set(field.key)} disabled={off} autoComplete="off" />
            </div>
          ))}
          <div className="admin-field">
            <label className="admin-label" htmlFor="g-rating">Average rating</label>
            <input id="g-rating" className="admin-input" inputMode="decimal" value={form.rating} onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value.replace(/[^0-9.]/g, "").slice(0, 3) }))} disabled={off} autoComplete="off" />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="g-reviews">Total reviews</label>
            <input id="g-reviews" className="admin-input" inputMode="numeric" value={form.reviews} onChange={set("reviews")} disabled={off} autoComplete="off" />
          </div>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="g-note">A note (optional)</label>
          <input id="g-note" className="admin-input" value={form.note} onChange={set("note")} maxLength={NOTE_MAX} disabled={off} autoComplete="off" />
        </div>
        <div className="admin-actions">
          <button type="submit" className="btn-red" disabled={busy || off}>{busy ? "Saving…" : "Save the numbers"}</button>
        </div>
      </form>

      <div className="admin-panel">
        <h2>Earlier months</h2>
        {rows.length === 0 ? <p className="admin-helper">No month has been typed in yet.</p> : null}
        <div className="admin-list">
          {rows.map((row) => {
            const key = String(row.month).slice(0, 7);
            return (
              <div className="admin-row" key={key}>
                <div>
                  <div className="admin-row-title">{monthLabel(row.month)}</div>
                  <div className="admin-row-meta">
                    Calls {show(row.calls)} · Directions {show(row.directions)} · Profile views {show(row.profile_views)} · Rating {row.rating ?? "-"} · Reviews {show(row.reviews)}
                    {row.note ? ` · ${row.note}` : ""}
                  </div>
                </div>
                <div className="admin-row-actions">
                  <button type="button" className="btn-outline" disabled={off} onClick={() => { setForm(fromRow(row)); setMessage(`${monthLabel(row.month)} is in the form above. Change it and save to replace it.`); }}>Edit</button>
                  {confirming === key ? (
                    <button type="button" className="btn-outline" disabled={busy} onClick={() => { setConfirming(""); call("DELETE", `?month=${key}`, null, `${monthLabel(row.month)} was removed.`); }}>Really remove</button>
                  ) : (
                    <button type="button" className="btn-outline" disabled={busy} onClick={() => setConfirming(key)}>Remove</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="admin-helper">These figures feed the monthly report later.</p>
      </div>
    </>
  );
}
