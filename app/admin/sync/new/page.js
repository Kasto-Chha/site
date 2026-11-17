import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";
import { requireRole, ROLE } from "../../../../lib/auth/roles";
import { createServerSupabase } from "../../../../lib/supabase/server";
import { getProspect } from "../../../../lib/sync/prospects";
import NewMerchantClient from "./NewMerchantClient";

export const metadata = {
  title: "Tag a business - KastoChha Admin",
  robots: NOINDEX_NOFOLLOW
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewMerchantPage({ searchParams }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync/new">Sign in</a>
      </div>
    );
  }
  // Tagging a business from an audit prospect: its details come across, so nothing is typed twice.
  let initial = null;
  const id = Array.isArray(searchParams?.prospect) ? searchParams.prospect[0] : searchParams?.prospect;
  if (typeof id === "string" && UUID_RE.test(id)) {
    try {
      const prospect = await getProspect(createServerSupabase(), id);
      if (prospect && !prospect.merchant_id) {
        initial = { prospectId: prospect.id, businessName: prospect.business_name, area: prospect.area, businessKind: prospect.business_kind, kindLabel: prospect.kind_label || "", googleMapsUrl: prospect.google_maps_url || "" };
      }
    } catch {
      initial = null;
    }
  }
  return <NewMerchantClient initial={initial} />;
}
