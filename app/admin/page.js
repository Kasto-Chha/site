import { requireRole, ROLE } from "../../lib/auth/roles";

export const metadata = {
  title: "Admin - KastoChha"
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

  return (
    <div className="admin-page">
      <h1>Admin panel</h1>
      <div className="admin-grid">
        <a className="admin-card" href="/admin/posts">
          <h3>Blog posts</h3>
          <p>Create, edit, and publish blog stories.</p>
        </a>
        <a className="admin-card" href="/admin/roles">
          <h3>User roles</h3>
          <p>Promote users to admin roles.</p>
        </a>
      </div>
    </div>
  );
}
