"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const METHODS = [["cash", "Cash"], ["bank", "Bank transfer"], ["esewa", "eSewa"], ["khalti", "Khalti"], ["other", "Other"]];
const METHOD_LABEL = Object.fromEntries(METHODS);
const rs = (n) => `Rs ${Number(n).toLocaleString("en-US")}`;

// Payments for one business, recorded by hand: where it stands, record a payment, set an agreed price, and cancel a mistake (it is kept,
// struck out). Admins only. A payment is never deleted.
export default function BillingPanel({ merchantId, statusText, state, price, custom, standardMonthly, nextFrom, today, payments, readFailed, disabledReason }) {
  const router = useRouter();
  const [form, setForm] = useState({ amount: price ? String(price) : "", months: "1", method: "cash", paid_on: today, period_from: "", reference: "", note: "" });
  const [priceText, setPriceText] = useState(custom ? String(price) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [voiding, setVoiding] = useState("");
  const [reason, setReason] = useState("");
  const off = Boolean(disabledReason);
  const url = `/api/admin/sync/merchants/${merchantId}/payments`;
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function call(method, target, body, done) {
    if (busy) return false;
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch(target, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

  async function record(event) {
    event.preventDefault();
    const ok = await call("POST", url, { ...form, period_from: form.period_from || undefined }, "Payment recorded.");
    if (ok) setForm((f) => ({ ...f, reference: "", note: "", period_from: "" }));
  }
  const savePrice = (event) => { event.preventDefault(); return call("PUT", `/api/admin/sync/merchants/${merchantId}/price`, { monthlyPrice: priceText }, priceText.trim() ? "Price saved." : "Using the standard price."); };
  async function cancel(p) {
    if (voiding !== p.id) { setVoiding(p.id); setReason(""); return; }
    const ok = await call("PATCH", url, { paymentId: p.id, reason }, "Payment cancelled. It is kept, struck out.");
    if (ok) setVoiding("");
  }

  return (
    <div className="admin-panel">
      <h2>Payments</h2>
      {readFailed ? <div className="admin-banner" role="alert">Could not load the payments. Has migration 0039 been run?</div> : null}
      <p><span className={`sync-pill ${state === "overdue" ? "waiting" : state === "paid" ? "done" : ""}`}>{statusText}</span></p>
      <p className="admin-helper">
        Price: {price ? `${rs(price)} a month${custom ? " (agreed for this business)" : " (standard)"}` : "not set. Set the standard price on the Billing page."}
        {nextFrom ? ` · next period starts ${nextFrom}` : ""}
      </p>
      {off ? <div className="admin-banner" role="status">{disabledReason}</div> : null}
      {error ? <div className="admin-banner" role="alert">{error}</div> : null}
      {message ? <div className="admin-banner" role="status">{message}</div> : null}

      <form onSubmit={record}>
        <h3>Record a payment</h3>
        <div className="admin-field"><label className="admin-label" htmlFor="b-amount">Amount received (rupees)</label><input id="b-amount" className="admin-input" inputMode="numeric" value={form.amount} onChange={set("amount")} autoComplete="off" /></div>
        <div className="admin-field"><label className="admin-label" htmlFor="b-months">Months it pays for</label><select id="b-months" className="admin-select" value={form.months} onChange={set("months")}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
        <div className="admin-field"><label className="admin-label" htmlFor="b-method">How it was paid</label><select id="b-method" className="admin-select" value={form.method} onChange={set("method")}>{METHODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <div className="admin-field"><label className="admin-label" htmlFor="b-day">Day received</label><input id="b-day" type="date" className="admin-input" value={form.paid_on} max={today} onChange={set("paid_on")} /></div>
        <div className="admin-field"><label className="admin-label" htmlFor="b-from">First day it covers (leave blank to continue from {nextFrom || "today"})</label><input id="b-from" type="date" className="admin-input" value={form.period_from} onChange={set("period_from")} /></div>
        <div className="admin-field"><label className="admin-label" htmlFor="b-ref">Reference (transaction number, optional)</label><input id="b-ref" className="admin-input" value={form.reference} onChange={set("reference")} maxLength={60} autoComplete="off" /></div>
        <div className="admin-field"><label className="admin-label" htmlFor="b-note">Note (optional)</label><input id="b-note" className="admin-input" value={form.note} onChange={set("note")} maxLength={300} autoComplete="off" /></div>
        <div className="admin-actions"><button type="submit" className="btn-red" disabled={off || busy}>{busy ? "Saving…" : "Record payment"}</button></div>
      </form>

      <form onSubmit={savePrice}>
        <h3>Price for this business</h3>
        <div className="admin-field">
          <label className="admin-label" htmlFor="b-price">Monthly price agreed (rupees)</label>
          <input id="b-price" className="admin-input" inputMode="numeric" value={priceText} onChange={(e) => setPriceText(e.target.value)} autoComplete="off" />
          <div className="admin-helper">Leave blank to use the standard price{standardMonthly ? ` (${rs(standardMonthly)})` : ""}.</div>
        </div>
        <div className="admin-actions"><button type="submit" className="btn-outline" disabled={busy}>Save price</button></div>
      </form>

      <h3>History</h3>
      {payments.length === 0 ? <p className="admin-helper">No payments recorded yet.</p> : (
        <div className="admin-list">
          {payments.map((p) => (
            <div className="admin-row" key={p.id}>
              <div style={p.voided_at ? { textDecoration: "line-through", opacity: 0.7 } : undefined}>
                <div className="admin-row-title">KC-{String(p.receipt_no).padStart(5, "0")} · {rs(p.amount)} · {METHOD_LABEL[p.method] || p.method}</div>
                <div className="admin-row-meta">Received {p.paid_on} · covers {p.period_from} to {p.period_to} ({p.months} {p.months === 1 ? "month" : "months"}){p.reference ? ` · ref ${p.reference}` : ""}</div>
                {p.note ? <div className="admin-row-meta">{p.note}</div> : null}
              </div>
              {p.voided_at ? <div className="admin-row-meta">Cancelled: {p.void_reason}</div> : (
                <div className="admin-row-actions">
                  <a className="btn-outline" href={`/admin/sync/${merchantId}/receipt/${p.id}`}>Receipt</a>
                  {voiding === p.id ? (
                    <>
                      <input aria-label="Why is this payment cancelled?" className="admin-input" placeholder="Why is it cancelled?" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
                      <button type="button" className="btn-red" disabled={busy || !reason.trim()} onClick={() => cancel(p)}>Really cancel</button>
                      <button type="button" className="btn-outline" disabled={busy} onClick={() => setVoiding("")}>Keep it</button>
                    </>
                  ) : <button type="button" className="btn-outline" disabled={busy} onClick={() => cancel(p)}>Cancel payment</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
