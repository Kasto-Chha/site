import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../lib/supabase/server";
import { ownerHome } from "../../../lib/sync/owner";
import { monthLabel } from "../../../lib/sync/googleNumbers";
import { nepalDay } from "../../../lib/sync/time";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const show = (value) => (value === null || value === undefined ? "-" : Number(value).toLocaleString("en-US"));
const change = (c) => (c === null || c === undefined ? "" : c.delta === 0 ? "no change" : `${c.delta > 0 ? "+" : ""}${c.delta.toLocaleString("en-US")}${c.percent === null ? "" : ` (${c.percent > 0 ? "+" : ""}${c.percent}%)`}`);
const tone = (c) => (c && c.delta > 0 ? "ow-up" : c && c.delta < 0 ? "ow-down" : "");
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// One business, for its owner: this month's Google figures, the profile checklist, what we did, and the way into the inbox and the
// report. The owner is found from the signed-in account on the server; a business that is not theirs looks like one that is not there.
export default async function OwnerBusinessPage({ params, searchParams }) {
  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="ow-card">
        <h1 className="ow-title">Your business</h1>
        <p>Sign in with the account the KastoChha team linked to your business.</p>
        <a className="ow-btn" href={`/sign-in?redirect_url=/owner/${encodeURIComponent(params.id || "")}`}>Sign in</a>
      </div>
    );
  }
  if (!UUID_RE.test(params.id || "")) notFound();
  let home;
  try {
    home = await ownerHome(createServerSupabase(), userId, params.id, { month: searchParams?.month, today: nepalDay(Date.now()) });
  } catch (error) {
    console.error("Owner home failed:", error?.message || error);
    return <div className="ow-card"><p role="alert">Could not load your page. Please try again in a moment.</p></div>;
  }
  if (!home) notFound();
  const { business, report: r, months, notes, free } = home;
  const work = [];
  if (r.work.posts.total > 0) work.push(`${plural(r.work.posts.total, "post", "posts")} published on Google`);
  if (r.work.replies > 0) work.push(`${plural(r.work.replies, "review", "reviews")} answered`);
  for (const t of r.work.tasks.byType) work.push(`${t.label}: ${plural(t.n, "job", "jobs")} finished`);
  return (
    <>
      <div className="ow-top"><a className="ow-link" href="/owner">All my businesses</a></div>
      <p className="ow-kicker">Your business</p>
      <h1 className="ow-title">{business.name}</h1>
      <p className="ow-sub">{business.area} · {free ? "Free plan: we are not working on your Google profile" : "We are looking after your Google profile"}</p>

      <a className="ow-card ow-card-link" href={`/owner/${business.id}/inbox`}>
        <span><strong>Inbox</strong><br /><span className="ow-sub">Private notes from your customers</span></span>
        {notes.all > 0 ? <span className="ow-pill">{notes.urgent > 0 ? `${notes.urgent} urgent` : plural(notes.all, "note", "notes")}</span> : <span className="ow-sub">None yet</span>}
      </a>

      <div className="ow-card">
        <h2>{r.label} <span className="ow-sub">compared with {r.previousLabel}</span></h2>
        {r.hasNumbers ? (
          <>
            {r.metrics.map((m) => (
              <div className="ow-row" key={m.key}><span>{m.label}</span><span className="ow-num">{show(m.value)}<span className={`ow-delta ${tone(m.change)}`}>{change(m.change)}</span></span></div>
            ))}
            <div className="ow-row"><span>Rating · reviews</span><span className="ow-num">{r.rating.value === null ? "-" : r.rating.value.toFixed(1)} · {show(r.reviews.value)}<span className={`ow-delta ${tone(r.reviews.change)}`}>{r.reviews.change && r.reviews.change.delta !== 0 ? `${r.reviews.change.delta > 0 ? "+" : ""}${r.reviews.change.delta} new reviews` : ""}</span></span></div>
          </>
        ) : (
          <p className="ow-sub">Your Google figures for {r.label} are not in yet. We add them each month.</p>
        )}
        {months.length > 0 ? <a className="ow-btn" href={`/owner/${business.id}/report?month=${r.month}`}>Open the monthly report</a> : null}
      </div>

      {r.health ? (
        <div className="ow-card">
          <h2>Profile checklist</h2>
          <div className="ow-big">{r.health.score === null ? "-" : r.health.score}<span> / 100</span></div>
          <p>{r.health.passing} checks pass and {r.health.failing} still need work. Fixed rules, not a ranking.</p>
          {r.next.length > 0 ? <><strong>We are working on</strong><p>{r.next.join(" · ")}</p></> : null}
        </div>
      ) : null}

      {work.length > 0 ? (
        <div className="ow-card">
          <h2>What we did in {monthLabel(`${r.month}-01`).split(" ")[0]}</h2>
          {work.map((line) => <div key={line}>{line}</div>)}
        </div>
      ) : null}

      <p className="ow-fine">Figures come from your own Google Business Profile and are typed in by our team. We show what happened and what we did; we do not claim one caused the other.</p>
    </>
  );
}
