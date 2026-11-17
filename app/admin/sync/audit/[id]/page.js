import { NOINDEX_NOFOLLOW } from "../../../../../lib/seo/indexable";
import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import { LINK_STATUSES, getProspect } from "../../../../../lib/sync/prospects";
import { outreachTexts } from "../../../../../lib/sync/report";
import { cleanFrozen, contactsForProspect, readSettings, unfilled } from "../../../../../lib/sync/reportSettings";
import AuditClient from "./AuditClient";

export const metadata = { title: "Audit - KastoChha Admin", robots: NOINDEX_NOFOLLOW };
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AuditPage({ params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href={`/sign-in?redirect_url=/admin/sync/audit/${encodeURIComponent(params.id)}`}>Sign in</a>
      </div>
    );
  }
  let prospect = null;
  let error = "";
  if (UUID_RE.test(params.id || "")) {
    try {
      prospect = await getProspect(createServerSupabase(), params.id);
    } catch {
      error = "Could not load this audit. Has migration 0027 been run?";
    }
  }
  if (!prospect) {
    return (
      <div className="admin-page">
        <h1>{error ? "Audit" : "Audit not found"}</h1>
        {error ? <div className="admin-banner">{error}</div> : <p>This audit does not exist, or it was removed.</p>}
        <a className="btn-outline" href="/admin/sync/audit">Back to Audit</a>
      </div>
    );
  }
  // The private link and the words to send with it, made here so the settings never reach the browser.
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.kastochhanepal.com").replace(/\/+$/, "");
  const frozen = Boolean(cleanFrozen(prospect.report_contacts));
  const contacts = contactsForProspect(prospect, await readSettings(createServerSupabase()));
  const linkOn = Boolean(prospect.report_token) && LINK_STATUSES.includes(prospect.status);
  const links = linkOn ? { full: `${base}/report/${prospect.report_token}`, summary: `${base}/report/${prospect.report_token}?view=summary` } : null;
  const texts = linkOn ? outreachTexts(prospect, links, contacts) : null;
  const report = { hasLink: Boolean(prospect.report_token), linkOn, links, texts, opens: prospect.report_opens || 0, lastOpened: prospect.report_last_opened_at || "", missing: unfilled(contacts), frozen };
  const { id, business_name, area, business_kind, kind_label, google_maps_url, facts, drafts, facts_checked, drafts_checked, status, sent_via, sent_on, follow_up_on, merchant_id } = prospect;
  return (
    <AuditClient
      report={report}
      prospect={{ id, businessName: business_name, area, businessKind: business_kind, kindLabel: kind_label || "", googleMapsUrl: google_maps_url || "", facts: facts || {}, drafts: drafts || {}, factsChecked: Boolean(facts_checked), draftsChecked: Boolean(drafts_checked), status, sentVia: sent_via || "", sentOn: sent_on || "", followUpOn: follow_up_on || "", merchantId: merchant_id || "" }}
    />
  );
}
