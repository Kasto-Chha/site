import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";
import { createServerSupabase } from "../../../../lib/supabase/server";
import { syncAccess } from "../../../../lib/sync/access";
import { assignedMerchantIds } from "../../../../lib/sync/team";
import { kindDisplay } from "../../../../lib/sync/businessTypes";
import { listMerchantsForAdmin } from "../../../../lib/sync/merchants";
import { countLabel } from "../../../../lib/sync/text";

export const metadata = {
  title: "Sync businesses - KastoChha Admin",
  robots: NOINDEX_NOFOLLOW
};

// Always read fresh: an admin who has just tagged a business expects to see it.
export const dynamic = "force-dynamic";

export default async function SyncAdminPage() {
  const access = await syncAccess();
  if (!access.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync/businesses">Sign in</a>
      </div>
    );
  }

  // An admin sees every business; an operator sees only the ones assigned to them. If their assignments cannot be read they see an error, never all.
  let onlyIds = null;
  let scopeError = "";
  if (!access.isAdmin) {
    try {
      onlyIds = await assignedMerchantIds(createServerSupabase(), access.userId);
    } catch {
      onlyIds = [];
      scopeError = "Could not load your businesses.";
    }
  }
  const listed = await listMerchantsForAdmin({ onlyIds });
  const merchants = listed.merchants;
  const error = scopeError || listed.error;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <div className="page-kicker">SYNC</div>
          <h1>Businesses</h1>
          <p className="admin-sub">
            A business thread is an ordinary KastoChha thread with a business header, a QR hub and a private inbox.
            Tagging one never changes its posts.
          </p>
        </div>
        <div className="admin-actions">
          {access.isAdmin ? <a className="btn-outline" href="/admin/sync">Overview</a> : <a className="btn-outline" href="/admin/sync/tasks">Tasks</a>}
          {access.isAdmin ? <a className="btn-red" href="/admin/sync/new">Tag a business</a> : null}
        </div>
      </div>

      {error ? <div className="admin-banner">{error}</div> : null}

      {!error && merchants.length === 0 ? (
        <div className="admin-empty">{access.isAdmin ? "No business has been tagged yet. Tag the first one to start a pilot." : "No business has been assigned to you yet. An admin gives you one on the Team page."}</div>
      ) : (
        <div className="admin-list">
          {merchants.map((m) => (
            <div className="admin-row" key={m.id}>
              <div>
                <div className="admin-row-title">
                  {m.business_name}, {m.area}
                </div>
                <div className="admin-row-meta">
                  {kindDisplay(m.business_kind, m.kind_label)} · Thread /discussions/{m.topic_slug} · {countLabel(m.posts, "experience", "experiences")} · {countLabel(m.questions, "question", "questions")}
                </div>
              </div>
              <div className="admin-row-actions">
                <span className={`admin-status ${m.status === "active" ? "published" : "draft"}`}>
                  {m.status === "active" ? "Active" : "Tag removed"}
                </span>
                <a className="btn-outline" href={`/discussions/${m.topic_slug}`}>View thread</a>
                <a className="btn-outline" href={`/admin/sync/${m.id}`}>Open</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
