// The monthly report as one printable page (patch 14k). Print, then Save as PDF, makes the PDF. Nothing is built on the server.
import { DISCLAIMER } from "../../../../../lib/sync/monthly";

const show = (value) => (value === null || value === undefined ? "not typed in" : Number(value).toLocaleString("en-US"));
const arrow = (c) => (c === null ? "" : c.delta === 0 ? "no change" : `${c.delta > 0 ? "+" : ""}${c.delta.toLocaleString("en-US")}${c.percent === null ? "" : ` (${c.percent > 0 ? "+" : ""}${c.percent}%)`}`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function MonthlyView({ report, dateLabel }) {
  const r = report;
  const work = [];
  if (r.work.posts.total > 0) work.push(`${plural(r.work.posts.total, "post", "posts")} published on Google (${r.work.posts.byKind.map((k) => `${k.n} ${k.label.toLowerCase()}`).join(", ")})`);
  if (r.work.replies > 0) work.push(`${plural(r.work.replies, "review", "reviews")} answered`);
  for (const t of r.work.tasks.byType) work.push(`${t.label}: ${plural(t.n, "job", "jobs")} finished`);
  return (
    <div className="rp">
      <section className="rp-page">
        <p className="rp-kicker">Monthly report · {r.label}</p>
        <h1>{r.name}</h1>
        <p className="rp-sub">{r.area}</p>

        <h2>How people found and used the profile</h2>
        {r.hasNumbers ? (
          <table className="rp-table">
            <thead><tr><th>{r.label}</th><th>{r.previousLabel}</th><th>Change</th></tr></thead>
            <tbody>
              {r.metrics.map((m) => (
                <tr key={m.key}><td>{m.label}: <strong>{show(m.value)}</strong></td><td className="rp-off">{show(m.before)}</td><td>{arrow(m.change)}</td></tr>
              ))}
              <tr><td>Star rating: <strong>{r.rating.value === null ? "not typed in" : r.rating.value.toFixed(1)}</strong></td><td className="rp-off">{r.rating.before === null ? "not typed in" : r.rating.before.toFixed(1)}</td><td></td></tr>
              <tr><td>Reviews in total: <strong>{show(r.reviews.value)}</strong></td><td className="rp-off">{show(r.reviews.before)}</td><td>{r.reviews.change && r.reviews.change.delta !== 0 ? `${r.reviews.change.delta > 0 ? "+" : ""}${r.reviews.change.delta} new` : arrow(r.reviews.change)}</td></tr>
            </tbody>
          </table>
        ) : (
          <p className="rp-off">The figures for {r.label} were not available when this report was made.</p>
        )}
        {r.note ? <p className="rp-note">Note: {r.note}</p> : null}

        <h2>What we did this month</h2>
        {work.length === 0 ? <p className="rp-off">Nothing was recorded as finished this month.</p> : <ul>{work.map((line) => <li key={line}>{line}</li>)}</ul>}

        {r.health ? (
          <>
            <h2>The profile checklist</h2>
            <p>{r.health.score === null ? "No score yet." : <><strong>{r.health.score}/100</strong> at the end of the month</>}{r.health.before !== null && r.health.score !== null ? `, from ${r.health.before}/100 before` : ""}. {r.health.passing} checks pass and {r.health.failing} still need work (checked {r.health.checkedOn}).</p>
          </>
        ) : null}

        {r.next.length > 0 ? (
          <>
            <h2>What we look at next</h2>
            <ul>{r.next.map((line) => <li key={line}>{line}</li>)}</ul>
          </>
        ) : null}

        <p className="rp-fine">{DISCLAIMER}</p>
        <footer className="rp-foot"><span>KastoChha · {r.name}, {r.area}</span><span>{dateLabel}</span></footer>
      </section>
    </div>
  );
}
