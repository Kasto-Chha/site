import { RANGES, RANGE_LABELS, formatCount, relativeDay, shortDay } from "../../../lib/sync/overview";

// The pieces of the Sync overview, as plain components with no state, so each can be rendered and
// checked without a browser.

// 7 days is the default, so it has no ?range in its address.
export function RangeTabs({ range }) {
  return (
    // Not a <nav> element (see SyncNav): the site's stylesheet would pin it to the top of the page.
    <div className="ov-tabs" role="navigation" aria-label="Date range">
      {RANGES.map((r) => (
        <a key={r} href={r === "7d" ? "/admin/sync" : `/admin/sync?range=${r}`} aria-current={r === range ? "page" : undefined}>
          {RANGE_LABELS[r]}
        </a>
      ))}
    </div>
  );
}

export function StatTile({ label, value, sub, warn = false }) {
  return (
    <div className={`ov-card ov-tile${warn ? " warn" : ""}`}>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}

// Scans per day, a bar each, drawn as an SVG: no chart library, and it reads aloud as a sentence. The
// words (the busiest day's height, the first, middle and last dates) are ordinary text beside the
// picture, not text inside it: text inside a scaled SVG shrinks with the picture and becomes unreadable
// in a narrow column.
export function ScansChart({ daily }) {
  const W = 720;
  const H = 140;
  const top = 6;
  const total = daily.reduce((sum, d) => sum + d.scans, 0);
  const max = Math.max(1, ...daily.map((d) => d.scans));
  const slot = W / Math.max(1, daily.length);
  const barWidth = Math.max(2, slot * 0.7);
  const plotHeight = H - top - 1;
  const busiest = daily.reduce((best, d) => (d.scans > best.scans ? d : best), { day: "", scans: 0 });
  const label = total === 0
    ? `Scans per day over the last ${daily.length} days: none.`
    : `Scans per day over the last ${daily.length} days: ${formatCount(total)} in all, the most on ${shortDay(busiest.day)} with ${formatCount(busiest.scans)}.`;
  const mid = daily[Math.floor(daily.length / 2)];

  return (
    <div>
      <div className="ov-chart-meta">
        <span>{formatCount(total)} in {daily.length} days</span>
        <span>Most in a day: {formatCount(busiest.scans)}</span>
      </div>
      <svg className="ov-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
        <line className="axis" x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} />
        {daily.map((d, i) => {
          const height = d.scans === 0 ? 0 : Math.max(2, (d.scans / max) * plotHeight);
          return (
            <rect key={d.day} className="bar" x={i * slot + (slot - barWidth) / 2} y={H - 1 - height} width={barWidth} height={height} rx="1.5">
              <title>{`${shortDay(d.day)}: ${formatCount(d.scans)} ${d.scans === 1 ? "scan" : "scans"}`}</title>
            </rect>
          );
        })}
      </svg>
      {daily.length ? (
        <div className="ov-chart-axis">
          <span>{shortDay(daily[0].day)}</span>
          <span>{shortDay(mid.day)}</span>
          <span>{shortDay(daily[daily.length - 1].day)}</span>
        </div>
      ) : null}
    </div>
  );
}

// The businesses, the ones that need something first. A business's name links to its own page.
export function BusinessTable({ rows, rangeLabel, now }) {
  return (
    <div className="ov-card ov-table-wrap">
      <table className="ov-table" aria-label="Businesses">
        <thead>
          <tr>
            <th>Business</th>
            <th className="num">QR codes on</th>
            <th className="num" title={rangeLabel}>Scans</th>
            <th className="num" title={rangeLabel}>Hub taps</th>
            <th className="num" title={rangeLabel}>Badge opens</th>
            <th className="num" title={rangeLabel}>Posts</th>
            <th>Last activity</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.severity >= 2 ? "attn" : undefined}>
              <td className="nm">
                <a href={`/admin/sync/${row.id}`}>{row.name}</a>
                <small>{row.kindName} · {row.area}</small>
              </td>
              <td className="num">{row.activeCodes} of {row.codes}</td>
              <td className="num">{formatCount(row.scans)}</td>
              <td className="num">{formatCount(row.taps)}</td>
              <td className="num">{formatCount(row.badgeOpens)}</td>
              <td className="num">{formatCount(row.posts)}</td>
              <td>{relativeDay(row.lastActivity, now) ?? "No activity yet"}</td>
              <td>
                <span className={`ov-pill ${row.status.level}`}>{row.status.label}</span>
                {row.issues.length > 1 ? (
                  <span className="ov-more" title={row.issues.slice(1).map((i) => i.label).join(", ")}>+{row.issues.length - 1} more</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// What was done, counted, each as a bar the length of its share of the busiest. Counts only: a tap is
// not a post, and nothing links the two.
export function ActivityBars({ totals }) {
  const items = [
    ["QR scans", totals.scans],
    ["Hub: Share your experience tapped", totals.taps.share],
    ["Hub: Ask a question tapped", totals.taps.ask],
    ["Hub: Review on Google tapped", totals.taps.google],
    ["Copy my text and open Google tapped", totals.taps.copy],
    ["Hub: Find us on Google Maps tapped", totals.taps.maps],
    ["Website badge opened", totals.badge.open],
    ["Badge: Share clicked", totals.badge.share],
    ["Badge: Ask clicked", totals.badge.ask],
    ["Posts marked Visited", totals.posts.visited]
  ];
  const max = Math.max(1, ...items.map(([, n]) => n));
  return (
    <div>
      <div className="ov-bars">
        {items.map(([label, n]) => (
          <div key={label}>
            <div className="ov-bar-row">
              <span>{label}</span>
              <span className="mono">{formatCount(n)}</span>
            </div>
            <div className="ov-bar-track">
              <i style={{ width: `${n === 0 ? 0 : Math.max(3, Math.round((n / max) * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="ov-note">Taps show intent only. Google does not say whether a review was posted, and KastoChha does not link a tap to a post.</p>
    </div>
  );
}

export function TopCodes({ codes }) {
  if (codes.length === 0) return <p className="ov-note" style={{ margin: 0 }}>No scans in this range.</p>;
  return (
    <ul className="ov-list">
      {codes.map((c) => (
        <li key={c.id}>
          <span>
            {c.label}
            <small>{c.business}</small>
          </span>
          <span className="mono">{formatCount(c.scans)}</span>
        </li>
      ))}
    </ul>
  );
}
