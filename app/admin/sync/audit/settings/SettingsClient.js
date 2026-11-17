"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { SETTING_LABELS, SETTING_LIMITS } from "../../../../../lib/sync/reportSettings";

export default function SettingsClient({ initial }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/sync/report-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setMessage(data.unchanged ? "Nothing changed." : "Saved. New and unsent reports show this now; reports already sent keep what they showed.");
      router.refresh();
    } catch (failure) {
      setError(failure.message);
    }
    setBusy(false);
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <div className="page-kicker">SYNC · AUDIT</div>
          <h1>Report settings</h1>
          <p className="admin-sub">What every report says about the price and how to reach you. A report is saved with these values the moment you record it as sent.</p>
        </div>
        <div className="admin-actions"><a className="btn-outline" href="/admin/sync/audit">Back</a></div>
      </div>
      <form className="admin-panel" onSubmit={save}>
        {error ? <div className="admin-banner" role="alert">{error}</div> : null}
        {message ? <div className="admin-banner" role="status">{message}</div> : null}
        <div className="admin-field">
          <label className="admin-label" htmlFor="s-price">{SETTING_LABELS.price}</label>
          <input id="s-price" className="admin-input" value={form.price} onChange={set("price")} maxLength={SETTING_LIMITS.price} autoComplete="off" placeholder="For example Rs 3,000 a month" />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="s-phone">{SETTING_LABELS.phone}</label>
          <input id="s-phone" className="admin-input" value={form.phone} onChange={set("phone")} maxLength={SETTING_LIMITS.phone} autoComplete="off" inputMode="tel" />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="s-wa">{SETTING_LABELS.whatsapp}</label>
          <input id="s-wa" className="admin-input" value={form.whatsapp} onChange={set("whatsapp")} maxLength={SETTING_LIMITS.whatsapp} autoComplete="off" inputMode="tel" />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="s-book">{SETTING_LABELS.booking}</label>
          <input id="s-book" className="admin-input" value={form.booking} onChange={set("booking")} maxLength={SETTING_LIMITS.booking} autoComplete="off" placeholder="https://…  Leave empty to leave the line out" />
        </div>
        <p className="admin-helper">Anything left empty shows as [PRICE], [PHONE] or [WHATSAPP] in the report until you fill it in.</p>
        <div className="admin-actions"><button type="submit" className="btn-red" disabled={busy}>{busy ? "Saving…" : "Save"}</button></div>
      </form>
    </div>
  );
}
