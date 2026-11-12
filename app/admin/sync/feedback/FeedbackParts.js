// The pieces of the feedback inbox, as plain components with no state of their own, so each can be rendered
// and checked without a browser. FeedbackInbox.js gives them their buttons.

export const STATUS_LABELS = { new: "New", in_digest: "In digest", resolved: "Resolved" };
const TABS = [
  ["all", "All"],
  ["urgent", "Urgent"],
  ["new", "New"],
  ["in_digest", "In digest"],
  ["resolved", "Resolved"]
];

// A navigation role, not a <nav> element: the site's stylesheet would pin a <nav> to the top of the page.
export function FeedbackTabs({ filter, counts }) {
  return (
    <div className="ov-tabs" role="navigation" aria-label="Inbox filter">
      {TABS.map(([key, label]) => (
        <a key={key} href={key === "all" ? "/admin/sync/feedback" : `/admin/sync/feedback?status=${key}`} aria-current={key === filter ? "page" : undefined}>
          {label} <span className="mono">{counts[key] ?? 0}</span>
        </a>
      ))}
    </div>
  );
}

export function FeedbackNote({ note, age, busy, copied, onStatus, onCopy, onTask }) {
  const open = note.is_urgent && note.status !== "resolved";
  return (
    <article className={`ov-card fb-note${open ? " urgent" : ""}`}>
      <div className="fb-top">
        {open ? <span className="ov-pill warn">Urgent</span> : null}
        <span className={`ov-pill ${note.status === "resolved" ? "ok" : "info"}`}>{STATUS_LABELS[note.status] ?? note.status}</span>
        {note.business ? <a className="fb-biz" href={`/admin/sync/${note.business.id}`}>{note.business.business_name}</a> : <span className="fb-biz">Removed business</span>}
        {note.business && note.business.status === "cancelled" ? <span className="fb-removed">(tag removed)</span> : null}
        <span className="fb-age">{age}</span>
      </div>
      <p className="fb-text">{note.message}</p>
      <div className="fb-contact">{note.contact ? `Contact: ${note.contact}` : "No contact left"}</div>
      <div className="fb-actions">
        {note.status !== "resolved" ? (
          <button type="button" className={open ? "btn-red" : "btn-outline"} onClick={() => onCopy(note)} disabled={busy}>{open ? "Forward now (copy)" : "Copy to forward"}</button>
        ) : null}
        {note.status === "new" ? <button type="button" className="btn-outline" onClick={() => onStatus(note, "in_digest")} disabled={busy}>Mark sent in digest</button> : null}
        {note.status !== "resolved" ? <button type="button" className="btn-outline" onClick={() => onStatus(note, "resolved")} disabled={busy}>Resolve</button> : null}
        {note.status === "in_digest" ? <button type="button" className="btn-outline" onClick={() => onStatus(note, "new")} disabled={busy}>Back to new</button> : null}
        {note.status === "resolved" ? <button type="button" className="btn-outline" onClick={() => onStatus(note, "new")} disabled={busy}>Reopen</button> : null}
        {note.business && onTask ? <button type="button" className="btn-outline" onClick={() => onTask(note)} disabled={busy}>Make a task</button> : null}
        {copied ? <span className="fb-copied" role="status">{copied}</span> : null}
      </div>
    </article>
  );
}

// What is waiting to be sent to one business, as the message the team copies and sends on WhatsApp.
export function DigestCard({ digest, busy, copied, onCopy, onSent }) {
  return (
    <section className="ov-card ov-pad fb-digest">
      <h3>{digest.name}</h3>
      <p className="ov-note" style={{ margin: "0 0 10px" }}>
        {digest.count} private {digest.count === 1 ? "note" : "notes"} waiting{digest.urgent > 0 ? `, ${digest.urgent} urgent` : ""}. The team sends this on WhatsApp.
      </p>
      <pre className="fb-digest-text">{digest.text}</pre>
      <div className="fb-actions">
        <button type="button" className="btn-outline" onClick={() => onCopy(digest)} disabled={busy}>Copy digest</button>
        <button type="button" className="btn-red" onClick={() => onSent(digest)} disabled={busy}>Mark all sent</button>
        {copied ? <span className="fb-copied" role="status">{copied}</span> : null}
      </div>
    </section>
  );
}
