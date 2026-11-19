import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";
import { createServerSupabase } from "../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../lib/auth/roles";
import { billingOverview, readBillingSettings } from "../../../../lib/sync/billing";
import { whatsappLink } from "../../../../lib/sync/ownerMessage";
import BillingClient from "./BillingClient";

export const metadata = { title: "Billing - KastoChha Admin", robots: NOINDEX_NOFOLLOW };
export const dynamic = "force-dynamic";

// Who is paid up, due or late, and the money settings. Admins only.
export default async function BillingPage() {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync/billing">Sign in</a>
      </div>
    );
  }
  const supabase = createServerSupabase();
  const settings = await readBillingSettings(supabase);
  let rows = [];
  let failed = settings.failed;
  try {
    rows = await billingOverview(supabase, { standardMonthly: settings.standardMonthly, instructions: settings.instructions });
  } catch (error) {
    console.error("Sync billing failed:", error?.message || error);
    failed = true;
  }
  const shown = rows.map((r) => ({ id: r.id, name: r.name, area: r.area, state: r.status.state, line: r.line, price: r.status.price, reminder: r.reminder, link: r.reminder ? whatsappLink(r.whatsapp, r.reminder) : "" }));
  return <BillingClient settings={{ standardMonthly: settings.standardMonthly === null ? "" : String(settings.standardMonthly), instructions: settings.instructions, issuer: settings.issuer }} rows={shown} failed={failed} />;
}
