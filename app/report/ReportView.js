// The audit report, as pages (patch 14e). Used by the private link and by the admin preview, so the owner sees what the team
// sees. "full" is five pages, "summary" two. It prints as A4: the browser's Print, then Save as PDF, makes the PDF.
import { buildReport } from "../../lib/sync/report";

const Score = ({ r }) => (
  <div className="rp-score">
    {r.score === null ? (
      <p>Not enough could be checked to give a score.</p>
    ) : (
      <>
        <div className="rp-big">{r.score}<span>/100</span></div>
        <p className="rp-note">
          {r.checked} of {r.total} checks. After the fixes below it could be about <strong>{r.projected}/100</strong> (an estimate, not a promise).
        </p>
      </>
    )}
  </div>
);

const Fixes = ({ r, withHow }) => (
  <ol className="rp-fixes">
    {r.fixes.length === 0 ? <li>Nothing urgent stood out from what could be seen.</li> : null}
    {r.fixes.map((fix) => (
      <li key={fix.key}>
        <h3>{fix.title} <span className={`rp-tag ${fix.priority === "High" ? "high" : ""}`}>{fix.priority}</span></h3>
        <p>{fix.why}</p>
        {withHow ? <p className="rp-how"><strong>How:</strong> {fix.how}</p> : null}
      </li>
    ))}
  </ol>
);

const Next = ({ r }) => (
  <>
    <h2>What happens next</h2>
    <p>This check is free and you do not have to do anything. If you would like us to look after the profile, we start with 90 days where we do the work: replies, posts, hours and photos, written in your voice and checked by you. After that it is {r.contacts.price}. You can stop at any time, and what was set up stays yours.</p>
    <p className="rp-contact">
      Phone {r.contacts.phone}<br />
      WhatsApp {r.contacts.whatsapp}{r.contacts.booking ? <br /> : null}
      {r.contacts.booking ? <>Book a call {r.contacts.booking}</> : null}
    </p>
  </>
);

const Fine = ({ r }) => <p className="rp-fine">{r.disclaimer}</p>;
const Foot = ({ r, page, of }) => <footer className="rp-foot"><span>KastoChha · {r.name}, {r.area}</span><span>{r.date} · page {page} of {of}</span></footer>;

export default function ReportView({ prospect, contacts, variant = "full", now = Date.now() }) {
  const r = buildReport(prospect, contacts, now);
  if (variant === "summary") {
    return (
      <div className="rp">
        <section className="rp-page">
          <p className="rp-kicker">Google profile check · {r.date}</p>
          <h1>{r.name}</h1>
          <p className="rp-sub">{r.kind} · {r.area}</p>
          <Score r={r} />
          <h2>The five things to fix first</h2>
          <Fixes r={r} withHow={false} />
          <Foot r={r} page={1} of={2} />
        </section>
        <section className="rp-page">
          <Next r={r} />
          <Fine r={r} />
          <Foot r={r} page={2} of={2} />
        </section>
      </div>
    );
  }
  return (
    <div className="rp">
      <section className="rp-page">
        <p className="rp-kicker">Google profile check · {r.date}</p>
        <h1>{r.name}</h1>
        <p className="rp-sub">{r.kind} · {r.area}</p>
        <Score r={r} />
        <p>We looked at your public Google profile the way a customer sees it, and checked {r.total} things. This report shows what we found, the five fixes that matter most, and text you can paste in.</p>
        <Foot r={r} page={1} of={5} />
      </section>
      <section className="rp-page">
        <h2>What we looked at</h2>
        <table className="rp-table">
          <thead><tr><th>Check</th><th>What we saw</th><th>Points</th></tr></thead>
          <tbody>
            {r.rows.map((row) => (
              <tr key={row.key} className={row.known ? "" : "rp-off"}>
                <td>{row.label}</td>
                <td>{row.says}</td>
                <td>{row.known ? `${row.points} / ${row.max}` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Foot r={r} page={2} of={5} />
      </section>
      <section className="rp-page">
        <h2>The five things to fix first</h2>
        <Fixes r={r} withHow />
        <Foot r={r} page={3} of={5} />
      </section>
      <section className="rp-page">
        <h2>Text ready to paste</h2>
        {r.drafts.length === 0 ? <p>No text was prepared for this report.</p> : null}
        {r.drafts.map((draft) => (
          <div key={draft.key} className="rp-draft">
            <h3>{draft.label}</h3>
            <p>{draft.text}</p>
          </div>
        ))}
        <Foot r={r} page={4} of={5} />
      </section>
      <section className="rp-page">
        <Next r={r} />
        <Fine r={r} />
        <Foot r={r} page={5} of={5} />
      </section>
    </div>
  );
}
