"use client";

import { useMemo, useState } from "react";

import { TASK_SOURCE_LABELS, TASK_STATUS_LABELS, TASK_TYPES, TASK_TYPE_LABELS, TITLE_MAX, DETAILS_MAX, isDueNow, sortTasks } from "../../../../lib/sync/tasks";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "mine", label: "Mine" },
  { key: "due", label: "Due today" },
  { key: "waiting", label: "With owner" },
  { key: "done", label: "Done" }
];

async function call(url, method, body) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That did not work.");
  return data;
}

// The task list, the filters, the "Log a request" box, and the buttons that change a task. Every change goes to the
// server, which decides whether it is allowed; the screen only reflects what the server answered.
export default function TasksClient({ initialTasks, merchants, people, today, isAdmin, meId }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState("open");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ merchantId: "", title: "", details: "", type: "other", assignee: "", dueDate: "", source: "whatsapp" });
  const [saving, setSaving] = useState(false);

  const merchantName = useMemo(() => Object.fromEntries(merchants.map((m) => [m.id, `${m.business_name}, ${m.area}`])), [merchants]);
  const personName = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.label])), [people]);

  const matches = {
    open: (t) => t.status !== "done",
    mine: (t) => t.status !== "done" && t.assignee_user_id === meId,
    due: (t) => isDueNow(t, today),
    waiting: (t) => t.status === "waiting",
    done: (t) => t.status === "done"
  };
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, tasks.filter(matches[f.key]).length]));
  const shown = sortTasks(tasks.filter(matches[filter]));

  async function change(task, patch) {
    setBusyId(task.id);
    setError("");
    try {
      const { task: saved } = await call(`/api/admin/sync/tasks/${task.id}`, "PATCH", patch);
      setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusyId("");
    }
  }

  async function remove(task) {
    setBusyId(task.id);
    setError("");
    try {
      await call(`/api/admin/sync/tasks/${task.id}`, "DELETE");
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusyId("");
    }
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { task } = await call("/api/admin/sync/tasks", "POST", { ...form, assignee: form.assignee || null, dueDate: form.dueDate || null });
      setTasks((prev) => [task, ...prev]);
      setForm((f) => ({ ...f, title: "", details: "", dueDate: "" }));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sync-tasks">
      {error ? <div className="admin-banner" role="alert">{error}</div> : null}

      <form className="admin-panel" onSubmit={submit}>
        <h2>Log a request</h2>
        <p className="admin-helper">Paste what the owner sent, or type what needs doing. It becomes one task for one business.</p>
        <div className="admin-field">
          <label className="admin-label" htmlFor="task-business">Business</label>
          <select id="task-business" className="admin-input" value={form.merchantId} onChange={(e) => setForm({ ...form, merchantId: e.target.value })}>
            <option value="">Choose a business</option>
            {merchants.map((m) => <option key={m.id} value={m.id}>{m.business_name}, {m.area}</option>)}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="task-title">What needs doing</label>
          <input id="task-title" className="admin-input" maxLength={TITLE_MAX} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Change Sunday hours to 10 to 5" />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="task-details">Details, such as the owner&apos;s words (optional)</label>
          <textarea id="task-details" className="admin-input" rows={3} maxLength={DETAILS_MAX} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
        </div>
        <div className="sync-task-fields">
          <div className="admin-field">
            <label className="admin-label" htmlFor="task-type">Type</label>
            <select id="task-type" className="admin-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TASK_TYPES.map((t) => <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="task-who">Who</label>
            <select id="task-who" className="admin-input" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
              <option value="">Nobody yet</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="task-due">Due (optional)</label>
            <input id="task-due" className="admin-input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
        </div>
        <div className="admin-actions">
          <button type="submit" className="btn-red" disabled={saving || !form.merchantId || !form.title.trim()}>{saving ? "Working…" : "Create the task"}</button>
        </div>
      </form>

      <div className="sync-chips" role="tablist" aria-label="Filter tasks">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={filter === f.key ? "sync-chip on" : "sync-chip"} onClick={() => setFilter(f.key)}>
            {f.label} <span className="sync-chip-n">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="admin-empty">{tasks.length === 0 ? "No tasks yet. Log the first request above." : "Nothing here."}</div>
      ) : (
        <div className="admin-list">
          {shown.map((task) => {
            const busy = busyId === task.id;
            const overdue = isDueNow(task, today);
            return (
              <div className={task.urgent && task.status !== "done" ? "admin-row sync-task urgent" : "admin-row sync-task"} key={task.id}>
                <div className="sync-task-main">
                  <div className="admin-row-title">
                    {task.urgent && task.status !== "done" ? <span className="sync-pill crit">Urgent</span> : null} {task.title}
                  </div>
                  {task.details ? <div className="admin-row-meta sync-task-details">{task.details}</div> : null}
                  <div className="admin-row-meta">
                    {merchantName[task.merchant_id] || "A business"} · {TASK_TYPE_LABELS[task.task_type]} · {TASK_SOURCE_LABELS[task.source]} · {task.assignee_user_id ? personName[task.assignee_user_id] || "Another person" : "Nobody yet"}
                    {task.due_date ? <> · <span className={overdue ? "sync-due now" : "sync-due"}>Due {task.due_date}</span></> : null}
                  </div>
                </div>
                <div className="admin-actions">
                  <span className={`sync-pill ${task.status}`}>{TASK_STATUS_LABELS[task.status]}</span>
                  {task.status === "done" ? (
                    <button type="button" className="btn-outline" disabled={busy} onClick={() => change(task, { status: "open" })}>{busy ? "Working…" : "Reopen"}</button>
                  ) : (
                    <>
                      <button type="button" className="btn-red" disabled={busy} onClick={() => change(task, { status: "done" })}>{busy ? "Working…" : "Mark done"}</button>
                      <button type="button" className="btn-outline" disabled={busy} onClick={() => change(task, { status: task.status === "waiting" ? "open" : "waiting" })}>{task.status === "waiting" ? "Back to open" : "With owner"}</button>
                      <button type="button" className="btn-outline" disabled={busy} onClick={() => change(task, { urgent: !task.urgent })}>{task.urgent ? "Not urgent" : "Urgent"}</button>
                      <button type="button" className="btn-outline" disabled={busy} onClick={() => change(task, { assignee: task.assignee_user_id === meId ? null : meId })}>{task.assignee_user_id === meId ? "Drop it" : "Take it"}</button>
                    </>
                  )}
                  {isAdmin ? <button type="button" className="btn-outline" disabled={busy} onClick={() => remove(task)}>Delete</button> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
