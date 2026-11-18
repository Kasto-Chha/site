import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import MonthlyView from "../../../admin/sync/[id]/monthly/MonthlyView";
import PrintButton from "../../../report/PrintButton";
import { createServerSupabase } from "../../../../lib/supabase/server";
import { ownerHome } from "../../../../lib/sync/owner";
import { monthLabel } from "../../../../lib/sync/googleNumbers";
import { nepalDay } from "../../../../lib/sync/time";
import "../../../report/report.css";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The monthly report, for the owner to read, print or save as a PDF. The note typed with the figures is never on it.
export default async function OwnerReportPage({ params, searchParams }) {
  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="ow-card">
        <h1 className="ow-title">Monthly report</h1>
        <a className="ow-btn" href={`/sign-in?redirect_url=/owner/${encodeURIComponent(params.id || "")}`}>Sign in</a>
      </div>
    );
  }
  if (!UUID_RE.test(params.id || "")) notFound();
  let home;
  try {
    home = await ownerHome(createServerSupabase(), userId, params.id, { month: searchParams?.month, today: nepalDay(Date.now()) });
  } catch (error) {
    console.error("Owner report failed:", error?.message || error);
    return <div className="ow-card"><p role="alert">Could not load the report. Please try again in a moment.</p></div>;
  }
  if (!home) notFound();
  return (
    <main className="rp-wrap">
      <header className="rp-bar">
        <a className="rp-btn" href={`/owner/${home.business.id}`}>Back</a>
        <div className="rp-switch">
          {home.months.map((m) => <a key={m} className={`rp-btn${m === home.report.month ? " on" : ""}`} href={`/owner/${home.business.id}/report?month=${m}`}>{monthLabel(`${m}-01`)}</a>)}
          <PrintButton />
        </div>
      </header>
      <MonthlyView report={home.report} dateLabel={`Made ${nepalDay(Date.now())}`} />
    </main>
  );
}
