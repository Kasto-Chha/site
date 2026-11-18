"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Messaging the owner on WhatsApp by hand: the words are ready, the team's own phone sends them. "Open WhatsApp" opens it with the
// text typed in; the number is the owner's, or WhatsApp asks who to send it to. "Mark as sent" tells the rest of the team.
export default function OwnerMessagePanel({ merchantId, message, total, whatsapp, messagedAt, hasOwner, readFailed, link }) {
  const router = useRouter();
  const [number, setNumber] = useState(whatsapp || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const url = `/api/admin/sync/merchants/${merchantId}/owner-message`;

  async function call(method, body, done) {
    if (busy) return false;
    setBusy(true); setError(""); setNote("");
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That did not work.");
      setNote(done);
      if (data.whatsapp !== undefined) setNumber(data.whatsapp);
      router.refresh();
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setNote("Message copied.");
      setError("");
    } catch {
      setError("Could not copy. Select the text and copy it by hand.");
    }
  }

  const last = messagedAt ? new Date(messagedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  return (
    <div className="admin-panel">
      <h2>Message the owner</h2>
      {readFailed ? <div className="admin-banner" role="alert">Could not read the saved number. Has migration 0037 been run?</div> : null}
      <p className="admin-helper">{total > 0 ? `${total} ${total === 1 ? "thing is" : "things are"} waiting for the owner.` : "Nothing is waiting for the owner right now."} Open WhatsApp with the words ready, check them, and send from your own phone.{last ? ` Last messaged ${last}.` : " Not messaged yet."}</p>
      {!hasOwner ? <div className="admin-banner">No owner account is linked yet (Setup tab), so the link in the message will not work for them.</div> : null}
      <pre className="admin-helper" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message}</pre>
      <div className="admin-actions">
        <a className="btn-red" href={link} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>
        <button type="button" className="btn-outline" disabled={busy} onClick={copy}>Copy message</button>
        <button type="button" className="btn-outline" disabled={busy} onClick={() => call("POST", undefined, "Marked as sent.")}>Mark as sent</button>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); call("PUT", { whatsapp: number }, number.trim() ? "Number saved." : "Number removed."); }}>
        <div className="admin-field">
          <label className="admin-label" htmlFor="om-number">Owner&apos;s WhatsApp number (optional)</label>
          <input id="om-number" className="admin-input" inputMode="tel" autoComplete="off" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={30} />
          <div className="admin-helper">With it, WhatsApp opens straight to the owner. Without it, WhatsApp asks you to choose the contact. A Nepal mobile such as 9841 000 000 is fine.</div>
        </div>
        <div className="admin-actions"><button type="submit" className="btn-outline" disabled={busy}>Save number</button></div>
      </form>
      {error ? <div className="admin-banner" role="alert">{error}</div> : null}
      {note ? <p role="status" className="admin-helper">{note}</p> : null}
    </div>
  );
}
