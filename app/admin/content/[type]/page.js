import ContentListClient from "./ContentListClient";
import { createServerSupabase } from "../../../../lib/supabase/server";
import { requireRole, ROLE, hasRole } from "../../../../lib/auth/roles";
import { getContentType } from "../../../../lib/admin/contentTypes";
import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const config = getContentType(params.type);
  // Staff screens: nothing here belongs in search, and nothing worth
  // crawling onward from either.
  return {
    title: `${config ? config.label : "Content"} - KastoChha Admin`,
    robots: NOINDEX_NOFOLLOW
  };
}

export default async function AdminContentListPage({ params }) {
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

  const config = getContentType(params.type);
  if (!config) {
    return (
      <div className="admin-page">
        <h1>Unknown content type</h1>
        <a className="btn-outline" href="/admin">Back to admin</a>
      </div>
    );
  }

  let rows = [];
  let loadError = "";
  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from(config.table)
      .select("*")
      .order(config.order.column, { ascending: config.order.ascending });
    if (error) loadError = error.message;
    else rows = data || [];
  } catch (err) {
    loadError = err?.message || "Failed to load.";
  }

  return (
    <ContentListClient
      type={params.type}
      config={config}
      rows={rows}
      loadError={loadError}
      canDelete={hasRole(authResult.role, ROLE.SUPER_ADMIN)}
    />
  );
}
