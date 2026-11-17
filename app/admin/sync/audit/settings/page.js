import { NOINDEX_NOFOLLOW } from "../../../../../lib/seo/indexable";
import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import { readSettings } from "../../../../../lib/sync/reportSettings";
import SettingsClient from "./SettingsClient";

export const metadata = { title: "Report settings - KastoChha Admin", robots: NOINDEX_NOFOLLOW };
export const dynamic = "force-dynamic";

export default async function ReportSettingsPage() {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync/audit/settings">Sign in</a>
      </div>
    );
  }
  const row = await readSettings(createServerSupabase());
  return <SettingsClient initial={{ price: row?.price || "", phone: row?.phone || "", whatsapp: row?.whatsapp || "", booking: row?.booking_link || "" }} />;
}
