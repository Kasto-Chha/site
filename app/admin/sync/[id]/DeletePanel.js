"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Deleting a business from Sync for good. The button stays held until the business's name is typed exactly. The thread and
// every post stay on KastoChha; the QR codes, scan counts, private notes, owner replies, typed-in Google numbers, profile checks, posts, review-reply drafts, tasks and assignments go.
export default function DeletePanel({ merchantId, businessName }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = typed.trim() === businessName.trim() && typed.trim() !== "";

  async function remove(event) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/sync/merchants/${merchantId}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: typed })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "That did not work.");
      router.push("/admin/sync/businesses");
      router.refresh();
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }

  return (
    <form className="admin-panel" onSubmit={remove}>
      <h2>Delete this business from Sync</h2>
      <p className="admin-helper">
        Use this for something that was tagged by mistake and is not a business at all. The thread and every post stay on KastoChha.
        The QR codes, scan counts, private notes, owner replies, typed-in Google numbers, tasks and assignments are deleted, and this cannot be undone.
        To only take the business header off the thread, use Remove tag above instead.
      </p>
      {error ? <div className="admin-banner" role="alert">{error}</div> : null}
      <div className="admin-field">
        <label className="admin-label" htmlFor="delete-confirm">Type “{businessName}” to confirm</label>
        <input id="delete-confirm" className="admin-input" type="text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
      <div className="admin-actions">
        <button type="submit" className="btn-outline" disabled={!ready || busy}>{busy ? "Deleting…" : "Delete business"}</button>
      </div>
    </form>
  );
}
