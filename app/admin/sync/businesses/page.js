import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";
import { requireRole, ROLE } from "../../../../lib/auth/roles";
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
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync/businesses">Sign in</a>
      </div>
    );
  }

  const { merchants, error } = await listMerchantsForAdmin();

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
          <a className="btn-outline" href="/admin/sync">Overview</a>
          <a className="btn-red" href="/admin/sync/new">Tag a business</a>
        </div>
      </div>

      {error ? <div className="admin-banner">{error}</div> : null}

      {!error && merchants.length === 0 ? (
        <div className="admin-empty">No business has been tagged yet. Tag the first one to start a pilot.</div>
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
