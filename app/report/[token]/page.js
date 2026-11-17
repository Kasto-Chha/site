import { headers } from "next/headers";
import { notFound } from "next/navigation";

import ReportView from "../ReportView";
import PrintButton from "../PrintButton";
import { createServerSupabase } from "../../../lib/supabase/server";
import { TOKEN_RE, isBot } from "../../../lib/sync/report";
import { contactsForProspect, readSettings } from "../../../lib/sync/reportSettings";
import { getReportByToken, recordOpen } from "../../../lib/sync/reportStore";
import "../report.css";

export const dynamic = "force-dynamic";

// The private address of one business's report. It needs no login, is kept out of search engines, and works only while the link is
// on: stopping it, making a new one, or editing the audit again takes the old address off.
export const metadata = {
  title: "Google profile check - KastoChha",
  robots: { index: false, follow: false, nocache: true }
};

export default async function ReportPage({ params, searchParams }) {
  const token = String(params.token || "");
  if (!TOKEN_RE.test(token)) notFound();
  const supabase = createServerSupabase();
  let prospect = null;
  try {
    prospect = await getReportByToken(supabase, token);
  } catch {
    prospect = null;
  }
  if (!prospect) notFound();
  // A real person opening it is counted once per page view; preview robots and scripts are not.
  if (!isBot(headers().get("user-agent"))) await recordOpen(supabase, prospect);

  const settings = await readSettings(supabase);
  const variant = (Array.isArray(searchParams?.view) ? searchParams.view[0] : searchParams?.view) === "summary" ? "summary" : "full";
  return (
    <main className="rp-wrap">
      <header className="rp-bar">
        <a className="rp-logo" href="/" aria-label="KastoChha"><span className="r">Kasto</span><span className="b">Chha</span><span className="r">?</span></a>
        <div className="rp-switch">
          <a className={`rp-btn${variant === "full" ? " on" : ""}`} href={`/report/${token}`}>Full report</a>
          <a className={`rp-btn${variant === "summary" ? " on" : ""}`} href={`/report/${token}?view=summary`}>Short summary</a>
          <PrintButton />
        </div>
      </header>
      <ReportView prospect={prospect} contacts={contactsForProspect(prospect, settings)} variant={variant} />
    </main>
  );
}
