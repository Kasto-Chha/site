"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { longDate, shortDate } from "../../../../lib/sync/stage";

const LABEL = { wip: "WIP", active: "Active", free: "Free" };
const PILL = { wip: "waiting", active: "done", free: "" };

// A business's stage and, for a trial, how far along it is. An admin can move it; an operator only sees it. Every button asks
// the server, which decides and records the move.
export default function StagePanel({ merchantId, info, isAdmin }) {
  const router = useRouter();
  const [open, setOpen] = useState("");
  const [note, setNote] = useState("");
  const [ticked, setTicked] = useState(false);
  const [endsOn, setEndsOn] = useState("");
  const [days, setDays] = useState("90");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!info?.known) {
    return (
      <div className="admin-panel">
        <h2>Stage</h2>
        <p className="admin-helper">No stage is available for this business. Run the Sync migration 0026 in Supabase, then reload.</p>
      </div>
    );
  }

  const pct = info.total ? Math.min(100, Math.round((info.day / info.total) * 100)) : 100;
  const close = () => { setOpen(""); setNote(""); setTicked(false); setError(""); };

  async function send(body) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/sync/merchants/${merchantId}/stage`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "That did not work.");
      close();
      router.refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const noteField = (label) => (
    <div className="admin-field">
      <label className="admin-label" htmlFor="stage-note">{label}</label>
      <textarea id="stage-note" className="admin-input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
    </div>
  );
  const buttons = (primary, label) => (
    <div className="admin-actions">
      <button type="button" className="btn-red" disabled={busy} onClick={primary}>{busy ? "Working…" : label}</button>
      <button type="button" className="btn-outline" disabled={busy} onClick={close}>Cancel</button>
    </div>
  );

  return (
    <div className="admin-panel sync-stage">
      <h2>Stage <span className={`sync-pill ${PILL[info.stage]}`}>{LABEL[info.stage]}</span></h2>

      {info.stage === "wip" ? (
        <>
          <p className="admin-helper"><b>Trial: day {info.day} of {info.total}</b> · started {longDate(info.startedOn)} · ends {longDate(info.endsOn)}</p>
          <div className="sync-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
          <p className="admin-helper">
            Check-ins: {info.checkins.map((c) => `day ${c.day} (${shortDate(c.on)})`).join(" · ")}.
            {info.nextCheckin ? ` Next: day ${info.nextCheckin.day}, ${info.nextCheckin.inDays === 0 ? "today" : `in ${info.nextCheckin.inDays} ${info.nextCheckin.inDays === 1 ? "day" : "days"}`}.` : ""}
          </p>
          {info.decideSoon ? <div className="admin-banner" role="status">Decide by {longDate(info.endsOn)}. A trial that ends with no yes becomes Free.</div> : null}
        </>
      ) : null}
      {info.stage === "active" ? <p className="admin-helper">Paying. The trial ran {longDate(info.startedOn)} to {longDate(info.endsOn)}.</p> : null}
      {info.stage === "free" ? (
        <p className="admin-helper">
          {info.expired ? `The trial ended on ${longDate(info.endsOn)} with no yes, so this business is Free. ` : "Free. "}
          Its page, QR cards and badge on KastoChha are unchanged. We do nothing on its Google side.
        </p>
      ) : null}
      {info.note ? <p className="admin-helper">Note: {info.note}</p> : null}

      {error ? <div className="admin-banner" role="alert">{error}</div> : null}

      {isAdmin ? (
        <>
          {open === "" ? (
            <div className="admin-actions">
              {info.stage !== "active" ? <button type="button" className="btn-red" onClick={() => setOpen("make_active")}>Make Active (paying)</button> : null}
              {info.stage !== "free" ? <button type="button" className="btn-outline" onClick={() => setOpen("move_to_free")}>Move to Free</button> : null}
              {info.stage === "free" ? <button type="button" className="btn-outline" onClick={() => setOpen("start_trial")}>Start a trial again</button> : null}
              {info.stored === "wip" ? <button type="button" className="btn-outline" onClick={() => { setEndsOn(info.endsOn); setOpen("change_end_date"); }}>Change the end date</button> : null}
            </div>
          ) : null}

          {open === "make_active" ? (
            <div>
              {noteField("Why they said yes (optional)")}
              {buttons(() => send({ action: "make_active", note }), "Make Active")}
            </div>
          ) : null}
          {open === "move_to_free" ? (
            <div>
              <div className="admin-banner">
                <label>
                  <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} />{" "}
                  <b>KastoChha is removed as a manager on their Google profile.</b>
                </label>
                <div className="admin-helper">Do this in the profile&apos;s People and access settings. Free means we have no access, so this cannot finish until it is ticked.</div>
              </div>
              {noteField("Why not (optional)")}
              <p className="admin-helper">Its page, QR cards and badge on KastoChha stay as they are.</p>
              <div className="admin-actions">
                <button type="button" className="btn-red" disabled={busy || !ticked} onClick={() => send({ action: "move_to_free", managerRemoved: ticked, note })}>{busy ? "Working…" : "Move to Free"}</button>
                <button type="button" className="btn-outline" disabled={busy} onClick={close}>Cancel</button>
              </div>
            </div>
          ) : null}
          {open === "start_trial" ? (
            <div>
              <div className="admin-field">
                <label className="admin-label" htmlFor="stage-days">Trial length in days</label>
                <input id="stage-days" className="admin-input" type="number" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)} />
              </div>
              {noteField("A note (optional)")}
              <p className="admin-helper">The new trial starts today. Ask the owner to add KastoChha as a manager on Google again.</p>
              {buttons(() => send({ action: "start_trial", days, note }), "Start the trial")}
            </div>
          ) : null}
          {open === "change_end_date" ? (
            <div>
              <div className="admin-field">
                <label className="admin-label" htmlFor="stage-end">New end date</label>
                <input id="stage-end" className="admin-input" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
              </div>
              {noteField("Why (required)")}
              {buttons(() => send({ action: "change_end_date", endsOn, note }), "Save the date")}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
