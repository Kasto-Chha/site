"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { QUESTIONS } from "../../../../lib/sync/health";

const STATE_LABEL = { pass: "Pass", fix: "Fix", unknown: "Unknown" };
const STATE_CLASS = { pass: "done", fix: "waiting", unknown: "" };
const GROUP_LABEL = { basics: "Basics", hours: "Hours", words: "Words", photos: "Photos", reviews: "Reviews", posts: "Posts" };

// The full profile-health screen: the 22 checks by group, check again (the form), tasks from the gaps, and the history. The answers
// are typed in until the Google connection exists. A Free business is held.
export default function HealthPanel({ merchantId, evaluation, facts, history, disabledReason, auditLine }) {
  const router = useRouter();
  const [form, setForm] = useState(() => Object.fromEntries(Object.entries(facts || {}).map(([key, value]) => [key, String(value)])));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const off = Boolean(disabledReason);

  async function call(method, body, done) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/sync/merchants/${merchantId}/health`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That did not work.");
      setMessage(done(data));
      router.refresh();
      return true;
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
    return false;
  }

  async function saveCheck(event) {
    event.preventDefault();
    if (await call("PUT", { facts: form }, (data) => `Checked. The score is ${data.score === null ? "not known yet" : `${data.score}/100`}.`)) setEditing(false);
  }

  const tasks = (keys) => call("POST", { keys }, (data) => (data.created === 0 ? "Those gaps already have an open task." : `${data.created} ${data.created === 1 ? "task was" : "tasks were"} made${data.skipped ? `, ${data.skipped} already had one` : ""}.`));
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const gapKeys = evaluation.results.filter((r) => r.state === "fix").map((r) => r.key);

  return (
    <>
      <div className="admin-panel">
        <h2>Score</h2>
        <p className="admin-helper">Fixed rules, not a ranking. The share of the checks that could be judged which pass. Typed in until the Google connection is approved.</p>
        {off ? <div className="admin-banner" role="status">{disabledReason}</div> : null}
        {error ? <div className="admin-banner" role="alert">{error}</div> : null}
        {message ? <div className="admin-banner" role="status">{message}</div> : null}
        {evaluation.score === null ? (
          <p>No check has been typed in yet.</p>
        ) : (
          <p><strong>{evaluation.score}/100</strong> · {evaluation.passing} of {evaluation.known} checked pass{evaluation.unknown ? ` · ${evaluation.unknown} not known` : ""}</p>
        )}
        {auditLine ? <p className="admin-helper">{auditLine}</p> : null}
        <div className="admin-actions">
          <button type="button" className="btn-red" disabled={off || busy} onClick={() => setEditing((v) => !v)}>{editing ? "Close the form" : "Check again"}</button>
          <button type="button" className="btn-outline" disabled={off || busy || gapKeys.length === 0} onClick={() => tasks("all")}>Make tasks from all gaps</button>
        </div>
      </div>

      {editing ? (
        <form className="admin-panel" onSubmit={saveCheck}>
          <h2>What the public Google profile shows today</h2>
          <p className="admin-helper">Read it the way a customer sees it. Leave a question empty if you cannot tell: it is left out of the score, never counted against the business.</p>
          {QUESTIONS.map((question) => (
            <div className="admin-field" key={question.key}>
              <label className="admin-label" htmlFor={`h-${question.key}`}>{GROUP_LABEL[question.group]}: {question.q}</label>
              {question.input.type === "choice" ? (
                <select id={`h-${question.key}`} className="admin-select" value={form[question.key] ?? ""} onChange={set(question.key)} autoComplete="off">
                  <option value="">Don’t know</option>
                  {Object.entries(question.input.options).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              ) : question.input.type === "rating" ? (
                <input id={`h-${question.key}`} className="admin-input" inputMode="decimal" value={form[question.key] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [question.key]: e.target.value.replace(/[^0-9.]/g, "").slice(0, 3) }))} autoComplete="off" />
              ) : (
                <input id={`h-${question.key}`} className="admin-input" inputMode="numeric" value={form[question.key] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [question.key]: e.target.value.replace(/[^0-9]/g, "") }))} autoComplete="off" />
              )}
            </div>
          ))}
          <div className="admin-actions">
            <button type="submit" className="btn-red" disabled={busy}>{busy ? "Saving…" : "Save this check"}</button>
          </div>
        </form>
      ) : null}

      {evaluation.groups.map((group) => (
        <div className="admin-panel" key={group.key}>
          <h2>{group.label}</h2>
          <p className="admin-helper">{group.passing} of {group.total} passing</p>
          <div className="admin-list">
            {group.checks.map((check) => (
              <div className="admin-row" key={check.key}>
                <div>
                  <div className="admin-row-title">{check.label}</div>
                  {check.state === "fix" ? <div className="admin-row-meta">{check.fix}</div> : null}
                </div>
                <div className="admin-row-actions">
                  <span className={`sync-pill ${STATE_CLASS[check.state]}`}>{STATE_LABEL[check.state]}</span>
                  {check.state === "fix" ? <button type="button" className="btn-outline" disabled={off || busy} onClick={() => tasks([check.key])}>Make a task</button> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="admin-panel">
        <h2>History</h2>
        {history.length === 0 ? <p className="admin-helper">No check yet.</p> : null}
        <div className="admin-list">
          {history.map((row) => (
            <div className="admin-row" key={row.id}>
              <div>
                <div className="admin-row-title">{row.checked_on}</div>
                <div className="admin-row-meta">{row.passing} pass · {row.failing} to fix · {row.unknown} not known</div>
              </div>
              <div className="admin-row-actions"><strong>{row.score === null ? "-" : `${row.score}/100`}</strong></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
