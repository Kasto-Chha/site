import { NOINDEX_NOFOLLOW } from "../../../lib/seo/indexable";
import AdminRolesClient from "./AdminRolesClient";
import { requireRole, ROLE } from "../../../lib/auth/roles";

export const metadata = {
  title: "User Roles - KastoChha",
  // Staff screens. Nothing here belongs in search, and there is nothing
  // worth crawling beyond them either.
  robots: NOINDEX_NOFOLLOW
};

export default async function AdminRolesPage() {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in">Sign in</a>
      </div>
    );
  }

  return <AdminRolesClient />;
}
