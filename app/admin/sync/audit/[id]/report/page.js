import { notFound } from "next/navigation";

import ReportView from "../../../../../report/ReportView";
import PrintButton from "../../../../../report/PrintButton";
import { NOINDEX_NOFOLLOW } from "../../../../../../lib/seo/indexable";
import { createServerSupabase } from "../../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../../lib/auth/roles";
import { getProspect } from "../../../../../../lib/sync/prospects";
import { contactsForProspect, readSettings } from "../../../../../../lib/sync/reportSettings";
import "../../../../../report/report.css";

export const metadata = { title: "Report preview - KastoChha Admin", robots: NOINDEX_NOFOLLOW };
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What the owner will see, for the team to check and to print. Admins only. Opening it is never counted as an open.
export default async function ReportPreviewPage({ params, searchParams }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync/audit">Sign in</a>
      </div>
    );
  }
  if (!UUID_RE.test(params.id || "")) notFound();
  let prospect = null;
  try {
    prospect = await getProspect(createServerSupabase(), params.id);
  } catch {
    prospect = null;
  }
  if (!prospect) notFound();
  const settings = await readSettings(createServerSupabase());
  const variant = (Array.isArray(searchParams?.view) ? searchParams.view[0] : searchParams?.view) === "summary" ? "summary" : "full";
  return (
    <main className="rp-wrap">
      <header className="rp-bar">
        <a className="rp-btn" href={`/admin/sync/audit/${prospect.id}`}>Back to the audit</a>
        <div className="rp-switch">
          <a className={`rp-btn${variant === "full" ? " on" : ""}`} href={`/admin/sync/audit/${prospect.id}/report`}>Full report</a>
          <a className={`rp-btn${variant === "summary" ? " on" : ""}`} href={`/admin/sync/audit/${prospect.id}/report?view=summary`}>Short summary</a>
          <PrintButton />
        </div>
      </header>
      <ReportView prospect={prospect} contacts={contactsForProspect(prospect, settings)} variant={variant} />
    </main>
  );
}
