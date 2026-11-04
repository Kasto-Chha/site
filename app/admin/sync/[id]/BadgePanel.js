"use client";

import { useState } from "react";

const ROWS = [
  ["badge_open", "Opened the popup"],
  ["badge_share", "Clicked Share your experience"],
  ["badge_ask", "Clicked Ask KastoChha Assist"]
];

// How the badge has been used. No state of its own, so it can be rendered and checked without a browser.
export function BadgeStats({ stats, error }) {
  if (error) return <div className="admin-banner">{error}</div>;
  if (!stats) return null;
  return (
    <div className="admin-list">
      {ROWS.map(([type, label]) => (
        <div className="admin-row" key={type}>
          <div className="admin-row-title">{label}</div>
          <div className="admin-row-meta">
            {stats[type].total} in all · {stats[type].week} in the last 7 days
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BadgePanel({ snippet, active, stats, statsError }) {
  const [message, setMessage] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setMessage("Copied.");
    } catch {
      setMessage("Could not copy automatically. Select the line above and copy it.");
    }
  }

  return (
    <div className="admin-panel">
      <h2>Website badge</h2>
      <p className="admin-helper">
        A small red &quot;Ask KastoChha&quot; button for this business&apos;s own website. It opens a popup that sends visitors to this business&apos;s page to share an experience, or to the chat. Paste the line below just before the closing &lt;/body&gt; tag of the business&apos;s site. It shows only while this business is tagged, so removing the tag turns it off everywhere within a minute.
      </p>
      {!active ? <div className="admin-banner">This business&apos;s tag has been removed, so its badge is not showing anywhere.</div> : null}

      <div className="admin-field">
        <span className="admin-label">The line to paste</span>
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#fff", border: "1px solid var(--border2)", borderRadius: 8, padding: 12, fontSize: 13, margin: 0 }}>
          <code>{snippet}</code>
        </pre>
      </div>
      <div className="admin-actions">
        <button type="button" className="btn-outline" onClick={copy}>Copy</button>
      </div>
      {message ? <div className="admin-helper" role="status">{message}</div> : null}
      <p className="admin-helper">To check it, open the business&apos;s website and look for the red button at the bottom right. Opening the popup counts as a use.</p>

      <BadgeStats stats={stats} error={statsError} />
    </div>
  );
}
