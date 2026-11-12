"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The operators who work on this business. An admin gives one a business, or takes it off. An operator sees and edits only
// the businesses assigned to them; the server enforces that, this panel only changes the list.
export default function AssignmentsPanel({ merchantId, assigned, available }) {
  const router = useRouter();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function run(name, method, operatorId) {
    setBusy(name);
    setError("");
    try {
      const response = await fetch("/api/admin/sync/assignments", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operatorId, merchantId }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "That did not work.");
      setPick("");
      router.refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="admin-panel">
      <h2>Assigned operators</h2>
      <p className="admin-helper">Operators can open this business, edit its details and work its tasks. They cannot remove its tag, link an owner or change its QR cards. Add operators on the Team page.</p>
      {assigned.length === 0 ? <p className="admin-helper">No operator is assigned yet.</p> : null}
      {assigned.map((op) => (
        <div className="admin-row" key={op.id}>
          <div className="admin-row-title">{op.name}</div>
          <button type="button" className="btn-outline" disabled={Boolean(busy)} onClick={() => run(`off-${op.id}`, "DELETE", op.id)}>{busy === `off-${op.id}` ? "Working…" : "Take off"}</button>
        </div>
      ))}
      {available.length ? (
        <div className="admin-actions">
          <select className="admin-input" aria-label="Assign an operator" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Assign an operator…</option>
            {available.map((op) => <option key={op.id} value={op.id}>{op.name}</option>)}
          </select>
          <button type="button" className="btn-outline" disabled={Boolean(busy) || !pick} onClick={() => run("assign", "PUT", pick)}>{busy === "assign" ? "Working…" : "Assign"}</button>
        </div>
      ) : null}
      {error ? <div className="admin-banner" role="alert">{error}</div> : null}
    </div>
  );
}
