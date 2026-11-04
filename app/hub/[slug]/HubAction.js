"use client";

// One option on the hub. A plain link, so it works with no script at all. When script runs, a
// tap is also reported (with sendBeacon, which survives the page being left), so the business
// can see which options its customers use. Reporting never delays or blocks the tap.
export default function HubAction({ action, slug, code }) {
  function report() {
    try {
      if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
      const body = new Blob([JSON.stringify({ slug, code: code || "", type: action.event })], { type: "application/json" });
      navigator.sendBeacon("/api/sync/event", body);
    } catch {
      // Counting is an aid, never a gate.
    }
  }

  const extra = action.external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <a className="hub-action" href={action.href} onClick={report} {...extra}>
      <span>
        <b>{action.title}</b>
        <small>{action.hint}</small>
      </span>
      <span className="hub-arrow" aria-hidden="true">&rsaquo;</span>
    </a>
  );
}
