import { NOINDEX_NOFOLLOW } from "../../lib/seo/indexable";
import { requireRole, ROLE, hasRole } from "../../lib/auth/roles";

export const metadata = {
  title: "Admin - KastoChha",
  // Staff screens. Nothing here belongs in search, and there is nothing
  // worth crawling beyond them either.
  robots: NOINDEX_NOFOLLOW
};

export default async function AdminHome() {
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

  const isSuperAdmin = hasRole(authResult.role, ROLE.SUPER_ADMIN);

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <div className="page-kicker">ADMIN</div>
          <h1>Admin panel</h1>
          <p className="admin-sub">
            Signed in as <strong>{isSuperAdmin ? "Super admin" : "Admin"}</strong>. Manage homepage content below.
          </p>
        </div>
        <a className="btn-outline" href="/">View site</a>
      </div>

      <div className="admin-grid">
        <a className="admin-card" href="/admin/content/trending">
          <h3>Trending topics</h3>
          <p>Poll questions on the homepage Trending grid.</p>
        </a>
        <a className="admin-card" href="/admin/content/battles">
          <h3>Battles</h3>
          <p>Head-to-head split-screen votes.</p>
        </a>
        <a className="admin-card" href="/admin/content/featured">
          <h3>Featured stories</h3>
          <p>Editor-pick cards in the Featured section.</p>
        </a>
        <a className="admin-card" href="/admin/content/reels">
          <h3>Reels</h3>
          <p>Embedded video reels — link only, no storage.</p>
        </a>
        <a className="admin-card" href="/admin/roles">
          <h3>User roles</h3>
          <p>
            Promote users to admin roles.
            {isSuperAdmin ? "" : " (Super admin needed to grant super admin.)"}
          </p>
        </a>
      </div>
    </div>
  );
}
