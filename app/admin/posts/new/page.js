import AdminPostEditor from "../AdminPostEditor";
import { requireRole, ROLE } from "../../../../lib/auth/roles";

export const metadata = {
  title: "New Post - KastoChha"
};

export default async function AdminPostNewPage() {
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

  return <AdminPostEditor mode="create" />;
}
