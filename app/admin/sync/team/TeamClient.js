"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function call(url, method, body) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That did not work.");
  return data;
}

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu" }) : "");

// Operators, who works on which business, and what the team did lately. Every button asks the server, which decides.
export default function TeamClient({ operators, merchants, actions }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [found, setFound] = useState(null);
  const [confirmAdd, setConfirmAdd] = useState(false);
  const [removing, setRemoving] = useState("");
  const [pick, setPick] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function run(name, action) {
    setBusy(name);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }

  const lookUp = (event) => {
    event.preventDefault();
    return run("lookup", async () => {
      setConfirmAdd(false);
      setFound((await call("/api/admin/sync/owner-lookup", "POST", { email })).user);
    });
  };
  const add = () =>
    run("add", async () => {
      await call("/api/admin/sync/team/operators", "POST", { userId: found.id });
      setFound(null);
      setEmail("");
      setConfirmAdd(false);
      router.refresh();
    });
  const remove = (id) =>
    run(`remove-${id}`, async () => {
      await call("/api/admin/sync/team/operators", "DELETE", { userId: id });
      setRemoving("");
      router.refresh();
    });
  const assign = (id) =>
    run(`assign-${id}`, async () => {
      await call("/api/admin/sync/assignments", "PUT", { operatorId: id, merchantId: pick[id] });
      setPick((p) => ({ ...p, [id]: "" }));
      router.refresh();
    });
  const unassign = (id, merchantId) =>
    run(`unassign-${id}-${merchantId}`, async () => {
      await call("/api/admin/sync/assignments", "DELETE", { operatorId: id, merchantId });
      router.refresh();
    });

  const held = Boolean(busy);
  return (
    <div className="sync-team">
      {error ? <div className="admin-banner" role="alert">{error}</div> : null}

      <div className="admin-panel">
        <h2>Add an operator</h2>
        <p className="admin-helper">The person signs up on the site first. Find them by email, check it is the right account, then confirm. Their email must be verified.</p>
        <form onSubmit={lookUp}>
          <div className="admin-field">
            <label className="admin-label" htmlFor="operator-email">Their email</label>
            <input id="operator-email" className="admin-input" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setFound(null); setConfirmAdd(false); }} />
          </div>
          <div className="admin-actions">
            <button type="submit" className="btn-outline" disabled={held || !email.trim()}>{busy === "lookup" ? "Working…" : "Look up"}</button>
          </div>
        </form>
        {found ? (
          <div className="admin-row">
            <div>
              <div className="admin-row-title">{found.name}</div>
              <div className="admin-row-meta">{found.email}{found.verified ? "" : " · email not verified"}</div>
            </div>
            {confirmAdd ? (
              <div className="admin-actions">
                <span>Make {found.name} an operator?</span>
                <button type="button" className="btn-red" onClick={add} disabled={held}>{busy === "add" ? "Working…" : "Yes, make operator"}</button>
                <button type="button" className="btn-outline" onClick={() => setConfirmAdd(false)} disabled={held}>No</button>
              </div>
            ) : (
              <div className="admin-actions">
                <button type="button" className="btn-red" onClick={() => setConfirmAdd(true)} disabled={held || !found.verified}>Make operator</button>
                <button type="button" className="btn-outline" onClick={() => setFound(null)} disabled={held}>Cancel</button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="admin-panel">
        <h2>Operators</h2>
        {operators.length === 0 ? (
          <p className="admin-helper">No operators yet.</p>
        ) : (
          <div className="admin-list">
            {operators.map((op) => {
              const assigned = new Set(op.businesses.map((b) => b.id));
              const options = merchants.filter((m) => !assigned.has(m.id));
              return (
                <div className="admin-row sync-operator" key={op.id}>
                  <div className="sync-task-main">
                    <div className="admin-row-title">{op.name} {op.stillOperator ? null : <span className="sync-pill crit">Not an operator now</span>}</div>
                    <div className="admin-row-meta">
                      {op.email ? `${op.email} · ` : ""}{op.businesses.length} {op.businesses.length === 1 ? "business" : "businesses"}{op.lastActive ? ` · last active ${when(op.lastActive)}` : ""}
                    </div>
                    <div className="sync-assigned">
                      {op.businesses.map((b) => (
                        <span className="sync-pill" key={b.id}>
                          {b.label}{" "}
                          <button type="button" className="sync-x" aria-label={`Take ${b.label} off ${op.name}`} disabled={held} onClick={() => unassign(op.id, b.id)}>×</button>
                        </span>
                      ))}
                    </div>
                    {op.stillOperator && options.length ? (
                      <div className="admin-actions">
                        <select className="admin-input" aria-label={`Give ${op.name} a business`} value={pick[op.id] || ""} onChange={(e) => setPick({ ...pick, [op.id]: e.target.value })}>
                          <option value="">Give a business…</option>
                          {options.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </select>
                        <button type="button" className="btn-outline" disabled={held || !pick[op.id]} onClick={() => assign(op.id)}>{busy === `assign-${op.id}` ? "Working…" : "Assign"}</button>
                      </div>
                    ) : null}
                  </div>
                  {removing === op.id ? (
                    <div className="admin-actions">
                      <span>Remove {op.name}? Their access ends now, and their tasks become nobody&apos;s.</span>
                      <button type="button" className="btn-red" disabled={held} onClick={() => remove(op.id)}>{busy === `remove-${op.id}` ? "Working…" : "Yes, remove"}</button>
                      <button type="button" className="btn-outline" disabled={held} onClick={() => setRemoving("")}>No</button>
                    </div>
                  ) : (
                    <button type="button" className="btn-outline" disabled={held} onClick={() => setRemoving(op.id)}>Remove operator</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="admin-panel">
        <h2>Recent actions</h2>
        <p className="admin-helper">Who did what and when, from the audit log. Names are looked up when you open this page; the log itself keeps only account ids, never the words of a note or a reply.</p>
        {actions.length === 0 ? (
          <p className="admin-helper">Nothing recorded yet.</p>
        ) : (
          <div className="admin-list">
            {actions.map((a, index) => (
              <div className="admin-row" key={index}>
                <div>
                  <div className="admin-row-title">{a.who} {a.text}{a.applied ? "" : " (did not go through)"}</div>
                  <div className="admin-row-meta">{when(a.when)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
