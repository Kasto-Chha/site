"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { kindDisplay } from "../../../../../lib/sync/businessTypes";
import { CHOICES, DRAFT_LABELS, DRAFT_LIMITS, NUMBERS, buildFixes, scoreFacts } from "../../../../../lib/sync/audit";
import { SEND_LABELS, SEND_WAYS, STATUS_LABELS, isEditable } from "../../../../../lib/sync/prospects";

// What each answer asks, in the words of the Google profile. Order is the order on screen.
const CHOICE_QUESTIONS = [
  ["name", "Does the name match the signboard, with nothing extra?"],
  ["contact", "Are the address, phone and map pin all set?"],
  ["hours", "Are the opening hours filled in?"],
  ["festival", "Are special (festival, holiday) hours set?"],
  ["description", "Is there a description?"],
  ["replies", "How does the owner answer reviews?"]
];
const NUMBER_QUESTIONS = [
  ["categories", "How many categories are chosen?"],
  ["photos", "How many photos are there?"],
  ["photoAgeMonths", "How old is the newest photo, in months?"],
  ["reviews", "How many reviews?"],
  ["waiting", "How many reviews have no reply?"],
  ["postDays", "Days since the last post (999 if it never posted)"]
];

const today = () => new Date(Date.now() + 345 * 60 * 1000).toISOString().slice(0, 10);

export default function AuditClient({ prospect, report }) {
  const router = useRouter();
  const editable = isEditable(prospect.status);
  const [facts, setFacts] = useState(() => Object.fromEntries(Object.entries(prospect.facts).map(([k, v]) => [k, String(v)])));
  const [drafts, setDrafts] = useState(prospect.drafts);
  const [factsChecked, setFactsChecked] = useState(prospect.factsChecked);
  const [draftsChecked, setDraftsChecked] = useState(prospect.draftsChecked);
  const [via, setVia] = useState(prospect.sentVia || "email");
  const [sentOn, setSentOn] = useState(prospect.sentOn || today());
  const [followUpOn, setFollowUpOn] = useState(prospect.followUpOn);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [typedDelete, setTypedDelete] = useState("");

  const cleanFactsForScore = useMemo(() => {
    const out = {};
    for (const [key, value] of Object.entries(facts)) {
      if (value === "" || value === undefined) continue;
      out[key] = key in CHOICES ? value : Number(value);
    }
    return out;
  }, [facts]);
  const scored = useMemo(() => scoreFacts(cleanFactsForScore), [cleanFactsForScore]);
  const fixes = useMemo(() => buildFixes(cleanFactsForScore), [cleanFactsForScore]);

  async function send(body, done) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/sync/prospects/${prospect.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That did not work.");
      setMessage(done);
      router.refresh();
    } catch (failure) {
      setError(failure.message);
    }
    setBusy(false);
  }

  const saveFacts = () => {
    setFactsChecked(false);
    setDraftsChecked(false);
    return send({ action: "facts", facts, drafts }, "Saved. The two checks are cleared, because the facts or drafts may have changed.");
  };
  const set = (key, value) => setFacts((f) => ({ ...f, [key]: value }));

  async function removeProspect() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/sync/prospects/${prospect.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not remove it.");
      router.push("/admin/sync/audit");
      router.refresh();
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }

  async function copy(text, what) {
    setError("");
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${what} copied.`);
    } catch {
      setError("Could not copy. Select the text and copy it by hand.");
    }
  }

  const sentLocked = prospect.status === "sent" || prospect.status === "replied" || prospect.status === "declined" || prospect.status === "tagged";

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <div className="page-kicker">SYNC · AUDIT</div>
          <h1>{prospect.businessName}, {prospect.area}</h1>
          <p className="admin-sub">
            {kindDisplay(prospect.businessKind, prospect.kindLabel)} · <span className="sync-pill">{STATUS_LABELS[prospect.status]}</span>
            {prospect.googleMapsUrl ? <> · <a href={prospect.googleMapsUrl} target="_blank" rel="noopener noreferrer">Open on Google</a></> : null}
          </p>
        </div>
        <div className="admin-actions">
          <a className="btn-outline" href="/admin/sync/audit">Back</a>
          {prospect.merchantId ? <a className="btn-outline" href={`/admin/sync/${prospect.merchantId}`}>Open business</a> : null}
        </div>
      </div>

      {error ? <div className="admin-banner" role="alert">{error}</div> : null}
      {message ? <div className="admin-banner" role="status">{message}</div> : null}
      {!editable ? <div className="admin-banner" role="status">A report has gone out for this audit, so the facts and drafts are locked.</div> : null}

      <div className="admin-panel">
        <h2>Step 2 of 5: What the public Google profile shows</h2>
        <p className="admin-helper">Read it as a customer would. Leave a question empty if you cannot tell: it is left out of the score, never counted against the business.</p>
        {CHOICE_QUESTIONS.map(([key, question]) => (
          <div className="admin-field" key={key}>
            <label className="admin-label" htmlFor={`f-${key}`}>{question}</label>
            <select id={`f-${key}`} className="admin-select" value={facts[key] ?? ""} onChange={(e) => set(key, e.target.value)} disabled={!editable} autoComplete="off">
              <option value="">Don’t know</option>
              {Object.entries(CHOICES[key]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        ))}
        {NUMBER_QUESTIONS.map(([key, question]) => (
          <div className="admin-field" key={key}>
            <label className="admin-label" htmlFor={`f-${key}`}>{question}</label>
            <input id={`f-${key}`} className="admin-input" inputMode="numeric" value={facts[key] ?? ""} min={NUMBERS[key][0]} max={NUMBERS[key][1]} onChange={(e) => set(key, e.target.value.replace(/[^0-9]/g, ""))} disabled={!editable} autoComplete="off" />
          </div>
        ))}
        <div className="admin-field">
          <label className="admin-label" htmlFor="f-rating">Star rating (0 to 5, one decimal)</label>
          <input id="f-rating" className="admin-input" inputMode="decimal" value={facts.rating ?? ""} onChange={(e) => set("rating", e.target.value.replace(/[^0-9.]/g, "").slice(0, 3))} disabled={!editable} autoComplete="off" />
        </div>
      </div>

      <div className="admin-panel">
        <h2>Step 3 of 5: The score and the five fixes</h2>
        <p className="admin-helper">Fixed rules, not a ranking: the same facts always give the same score. It is a snapshot of public information, not a promise.</p>
        {scored.score === null ? (
          <p>Fill in at least one answer to see the score.</p>
        ) : (
          <>
            <p><strong>{scored.score}/100</strong> now · about <strong>{scored.projected}/100</strong> after the fixes · {scored.checked} of {scored.total} checks known</p>
            <ol className="sync-steps">
              {fixes.map((fix) => <li key={fix.key}>{fix.title} <span className={`sync-pill ${fix.priority === "High" ? "crit" : "waiting"}`}>{fix.priority}</span></li>)}
              {fixes.length === 0 ? <li>Nothing to fix from what is known.</li> : null}
            </ol>
          </>
        )}
      </div>

      <div className="admin-panel">
        <h2>Step 4 of 5: The three drafts</h2>
        <p className="admin-helper">Text the owner can paste into Google. Write or edit each one yourself. Leave one empty to leave it out.</p>
        {Object.keys(DRAFT_LIMITS).map((key) => (
          <div className="admin-field" key={key}>
            <label className="admin-label" htmlFor={`d-${key}`}>{DRAFT_LABELS[key]} <span className="admin-helper">({(drafts[key] || "").length}/{DRAFT_LIMITS[key]})</span></label>
            <textarea id={`d-${key}`} className="admin-textarea" rows={key === "description" ? 6 : 3} value={drafts[key] || ""} onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))} disabled={!editable} maxLength={DRAFT_LIMITS[key]} />
          </div>
        ))}
        {editable ? (
          <div className="admin-actions">
            <button type="button" className="btn-outline" onClick={saveFacts} disabled={busy}>{busy ? "Saving…" : "Save for later"}</button>
          </div>
        ) : null}
      </div>

      {editable ? (
        <div className="admin-panel">
          <h2>Step 5 of 5: Make the report</h2>
          <p className="admin-helper">Save first, then tick both boxes. Saving again clears them.</p>
          <label className="admin-helper"><input type="checkbox" checked={factsChecked} onChange={(e) => setFactsChecked(e.target.checked)} /> I checked the facts against the Google profile.</label><br />
          <label className="admin-helper"><input type="checkbox" checked={draftsChecked} onChange={(e) => setDraftsChecked(e.target.checked)} /> I read all three drafts.</label>
          <div className="admin-actions">
            <button type="button" className="btn-red" disabled={busy || !factsChecked || !draftsChecked || prospect.status === "new"} onClick={() => send({ action: "make_report", factsChecked, draftsChecked }, "The report is ready.")}>Make the report</button>
          </div>
        </div>
      ) : null}

      {report.linkOn ? (
        <div className="admin-panel">
          <h2>The report</h2>
          {report.missing.length > 0 ? (
            <div className="admin-banner" role="status">
              The report still shows {report.missing.join(", ")}. Fill them in under <a href="/admin/sync/audit/settings">Report settings</a> before you send it.
            </div>
          ) : null}
          <div className="admin-actions">
            <a className="btn-outline" href={`/admin/sync/audit/${prospect.id}/report`} target="_blank" rel="noopener noreferrer">Preview the full report</a>
            <a className="btn-outline" href={`/admin/sync/audit/${prospect.id}/report?view=summary`} target="_blank" rel="noopener noreferrer">Preview the short summary</a>
          </div>
          {report.frozen ? <p className="admin-helper">The price and numbers in this report were saved when it was sent, so changing Report settings later does not change it.</p> : null}
          <p className="admin-helper">For a PDF: open a preview, press <strong>Print or save as PDF</strong>, and choose <strong>Save as PDF</strong> as the printer. Nothing is built on the server.</p>
          <div className="admin-field">
            <label className="admin-label" htmlFor="l-full">Private link, full report</label>
            <input id="l-full" className="admin-input" readOnly value={report.links.full} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn-outline" onClick={() => copy(report.links.full, "The full link")}>Copy</button>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="l-sum">Private link, short summary</label>
            <input id="l-sum" className="admin-input" readOnly value={report.links.summary} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn-outline" onClick={() => copy(report.links.summary, "The summary link")}>Copy</button>
          </div>
          <p className="admin-helper">
            {report.opens === 0 ? "Not opened yet." : `Opened ${report.opens} ${report.opens === 1 ? "time" : "times"}${report.lastOpened ? `, last on ${report.lastOpened.slice(0, 10)}` : ""}.`}{" "}
            Link-preview robots and your own previews are not counted. Anyone who has the link can read the report, so send it only to the business.
          </p>
          <div className="admin-actions">
            <button type="button" className="btn-outline" disabled={busy} onClick={() => send({ action: "new_link" }, "A new link was made. The old one no longer works, and the count started again.")}>Make a new link</button>
            <button type="button" className="btn-outline" disabled={busy} onClick={() => send({ action: "stop_link" }, "The link is off. Make the report again to turn it on.")}>Stop the link</button>
          </div>
          <h3>Words to send with it</h3>
          <div className="admin-field">
            <label className="admin-label" htmlFor="t-sub">Email subject</label>
            <input id="t-sub" className="admin-input" readOnly value={report.texts.subject} onFocus={(e) => e.target.select()} />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="t-mail">Email</label>
            <textarea id="t-mail" className="admin-textarea" rows={12} readOnly value={report.texts.email} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn-outline" onClick={() => copy(report.texts.email, "The email")}>Copy the email</button>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="t-wa">WhatsApp message</label>
            <textarea id="t-wa" className="admin-textarea" rows={3} readOnly value={report.texts.whatsapp} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn-outline" onClick={() => copy(report.texts.whatsapp, "The WhatsApp message")}>Copy the message</button>
          </div>
        </div>
      ) : report.hasLink ? (
        <div className="admin-banner" role="status">The private link is off until the report is made again.</div>
      ) : null}

      {prospect.status === "report_ready" || prospect.status === "sent" ? (
        <div className="admin-panel">
          <h2>{prospect.status === "sent" ? "Sent" : "Record that you sent it"}</h2>
          <div className="admin-two">
            <div className="admin-field">
              <label className="admin-label" htmlFor="s-via">How</label>
              <select id="s-via" className="admin-select" value={via} onChange={(e) => setVia(e.target.value)} autoComplete="off">
                {SEND_WAYS.map((way) => <option key={way} value={way}>{SEND_LABELS[way]}</option>)}
              </select>
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor="s-on">Date sent</label>
              <input id="s-on" className="admin-input" type="date" value={sentOn} max={today()} onChange={(e) => setSentOn(e.target.value)} />
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor="s-fu">Follow up on (optional)</label>
              <input id="s-fu" className="admin-input" type="date" value={followUpOn} min={sentOn} onChange={(e) => setFollowUpOn(e.target.value)} />
            </div>
          </div>
          <div className="admin-actions">
            <button type="button" className="btn-outline" disabled={busy} onClick={() => send({ action: "sent", via, sentOn, followUpOn }, "Recorded.")}>{prospect.status === "sent" ? "Update" : "Record as sent"}</button>
          </div>
        </div>
      ) : null}

      {prospect.status === "sent" ? (
        <div className="admin-actions">
          <button type="button" className="btn-outline" disabled={busy} onClick={() => send({ action: "replied" }, "Marked as replied.")}>They replied</button>
          <button type="button" className="btn-outline" disabled={busy} onClick={() => send({ action: "declined" }, "Marked as said no.")}>They said no</button>
        </div>
      ) : null}
      {prospect.status === "replied" ? (
        <div className="admin-actions">
          <a className="btn-red" href={`/admin/sync/new?prospect=${prospect.id}`}>Tag as business</a>
          <button type="button" className="btn-outline" disabled={busy} onClick={() => send({ action: "declined" }, "Marked as said no.")}>They said no</button>
        </div>
      ) : null}
      {prospect.status === "report_ready" ? (
        <div className="admin-actions">
          <button type="button" className="btn-outline" disabled={busy} onClick={() => send({ action: "declined" }, "Marked as said no.")}>They said no</button>
        </div>
      ) : null}
      {sentLocked && prospect.status === "sent" ? <p className="admin-helper">Sent {prospect.sentOn ? `on ${prospect.sentOn}` : ""} by {SEND_LABELS[prospect.sentVia] || prospect.sentVia}.</p> : null}

      {prospect.status !== "tagged" ? (
        <form className="admin-panel" onSubmit={(e) => { e.preventDefault(); if (typedDelete.trim() === prospect.businessName.trim()) removeProspect(); }}>
          <h2>Remove this audit</h2>
          <p className="admin-helper">For one added by mistake. This cannot be undone.</p>
          <div className="admin-field">
            <label className="admin-label" htmlFor="rm">Type “{prospect.businessName}” to confirm</label>
            <input id="rm" className="admin-input" value={typedDelete} onChange={(e) => setTypedDelete(e.target.value)} autoComplete="off" />
          </div>
          <div className="admin-actions">
            <button type="submit" className="btn-outline" disabled={busy || typedDelete.trim() !== prospect.businessName.trim()}>Remove audit</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
