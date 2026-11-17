import { NOINDEX_NOFOLLOW } from "../../../../../lib/seo/indexable";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import NewProspectClient from "./NewProspectClient";

export const metadata = { title: "New audit - KastoChha Admin", robots: NOINDEX_NOFOLLOW };

export default async function NewAuditPage() {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync/audit/new">Sign in</a>
      </div>
    );
  }
  return <NewProspectClient />;
}
