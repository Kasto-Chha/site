"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const rs = (n) => `Rs ${Number(n).toLocaleString("en-US")}`;

// Who owes what, with the WhatsApp reminder ready, and the money settings. The team sends the reminder from their own phone.
export default function BillingClient({ settings, rows, failed }) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/admin/sync/billing-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ standardMonthly: form.standardMonthly, instructions: form.instructions, issuer: form.issuer }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That did not work.");
      setMessage("Saved.");
      router.refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(row) {
    try {
      await navigator.clipboard.writeText(row.reminder);
      setMessage(`Reminder for ${row.name} copied.`);
      setError("");
    } catch {
      setError("Could not copy. Select the text and copy it by hand.");
    }
  }

  const late = rows.filter((r) => r.state === "overdue").length;
  return (
    <div className="admin-page">
      <div className="admin-header"><div><div className="page-kicker">SYNC</div><h1>Billing</h1><p className="admin-sub">{rows.length} paying {rows.length === 1 ? "business" : "businesses"} · {late} due or late</p></div></div>
      {failed ? <div className="admin-banner" role="alert">Could not load everything. Has migration 0039 been run?</div> : null}
      {error ? <div className="admin-banner" role="alert">{error}</div> : null}
      {message ? <div className="admin-banner" role="status">{message}</div> : null}

      <div className="admin-panel">
        <h2>Who owes what</h2>
        <p className="admin-helper">Active businesses, the ones to chase first at the top. A trial is not billed until the business says yes. Record a payment on the business&apos;s Plan tab.</p>
        {rows.length === 0 ? <p>No Active businesses yet.</p> : (
          <div className="admin-list">
            {rows.map((r) => (
              <div className="admin-row" key={r.id}>
                <div>
                  <div className="admin-row-title"><a href={`/admin/sync/${r.id}?tab=plan`}>{r.name}</a>, {r.area}</div>
                  <div className="admin-row-meta"><span className={`sync-pill ${r.state === "overdue" ? "waiting" : r.state === "paid" ? "done" : ""}`}>{r.line}</span>{r.price ? ` · ${rs(r.price)} a month` : " · no price set"}</div>
                </div>
                {r.reminder ? (
                  <div className="admin-row-actions">
                    <a className="btn-red" href={r.link} target="_blank" rel="noopener noreferrer">Remind on WhatsApp</a>
                    <button type="button" className="btn-outline" onClick={() => copy(r)}>Copy reminder</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <form className="admin-panel" onSubmit={save}>
        <h2>Money settings</h2>
        <div className="admin-field"><label className="admin-label" htmlFor="s-price">Standard monthly price (rupees)</label><input id="s-price" className="admin-input" inputMode="numeric" value={form.standardMonthly} onChange={set("standardMonthly")} autoComplete="off" /></div>
        <div className="admin-field"><label className="admin-label" htmlFor="s-how">How to pay (shown in reminders)</label><textarea id="s-how" className="admin-input" rows={4} value={form.instructions} onChange={set("instructions")} maxLength={500} /><div className="admin-helper">For example your eSewa or Khalti number and your bank account. {form.instructions.length} of 500 characters.</div></div>
        <div className="admin-field"><label className="admin-label" htmlFor="s-issuer">Line printed at the bottom of receipts</label><textarea id="s-issuer" className="admin-input" rows={3} value={form.issuer} onChange={set("issuer")} maxLength={300} /><div className="admin-helper">Your business name, address, PAN if you have one. {form.issuer.length} of 300 characters.</div></div>
        <div className="admin-actions"><button type="submit" className="btn-red" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button></div>
      </form>
    </div>
  );
}
