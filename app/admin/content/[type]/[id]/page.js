import ContentEditorClient from "./ContentEditorClient";
import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import { getContentType } from "../../../../../lib/admin/contentTypes";
import { NOINDEX_NOFOLLOW } from "../../../../../lib/seo/indexable";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const config = getContentType(params.type);
  const verb = params.id === "new" ? "New" : "Edit";
  return {
    title: `${verb} ${config ? config.singular : "content"} - KastoChha Admin`,
    robots: NOINDEX_NOFOLLOW
  };
}

export default async function AdminContentEditorPage({ params }) {
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

  let row = null;
  let loadError = "";
  if (params.id !== "new") {
    try {
      const supabase = createServerSupabase();
      const { data, error } = await supabase
        .from(config.table)
        .select("*")
        .eq("id", params.id)
        .single();
      if (error) loadError = error.message;
      else row = data;
    } catch (err) {
      loadError = err?.message || "Failed to load.";
    }
  }

  return (
    <ContentEditorClient
      type={params.type}
      id={params.id}
      config={config}
      row={row}
      loadError={loadError}
    />
  );
}
