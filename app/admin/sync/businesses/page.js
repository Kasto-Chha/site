import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";
import { createServerSupabase } from "../../../../lib/supabase/server";
import { syncAccess } from "../../../../lib/sync/access";
import { assignedMerchantIds } from "../../../../lib/sync/team";
import { kindDisplay } from "../../../../lib/sync/businessTypes";
import { listMerchantsForAdmin } from "../../../../lib/sync/merchants";
import { readStages } from "../../../../lib/sync/stageStore";
import { STAGE_LABELS, stageInfo, stageLine } from "../../../../lib/sync/stage";
import { countLabel } from "../../../../lib/sync/text";
import { FILTERS, FILTER_LABELS, filterBusinesses, listHref, parseListQuery, stageCounts } from "../../../../lib/sync/listFilter";

export const metadata = {
  title: "Sync businesses - KastoChha Admin",
  robots: NOINDEX_NOFOLLOW
};

// Always read fresh: an admin who has just tagged a business expects to see it.
export const dynamic = "force-dynamic";

export default async function SyncAdminPage({ searchParams }) {
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
  // The stage of each business. If it cannot be read the list still shows, and says why.
  const stages = merchants.length ? await readStages(createServerSupabase(), merchants.map((m) => m.id)) : { rows: new Map(), failed: false };
  // The filter and the search come from the address, so a view can be bookmarked or shared. Anything odd means "all".
  const query = parseListQuery(searchParams);
  const counts = stageCounts(merchants, stages.rows, query.q);
  const shown = filterBusinesses(merchants, stages.rows, query);

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

      {merchants.length > 0 ? (
        <div className="sync-filters">
          <div className="sync-chips" role="group" aria-label="Filter by stage">
            {FILTERS.map((key) => (
              <a key={key} className={`sync-chip${query.stage === key ? " on" : ""}`} href={listHref(key, query.q)} aria-current={query.stage === key ? "true" : undefined}>
                {FILTER_LABELS[key]} <span>{counts[key]}</span>
              </a>
            ))}
          </div>
          <form className="sync-search" method="get" action="/admin/sync/businesses" role="search">
            {query.stage !== "all" ? <input type="hidden" name="stage" value={query.stage} /> : null}
            <input className="admin-input" type="search" name="q" defaultValue={query.q} placeholder="Search by name or area" maxLength={80} aria-label="Search businesses" />
            <button className="btn-outline" type="submit">Search</button>
            {query.q ? <a className="btn-outline" href={listHref(query.stage, "")}>Clear</a> : null}
          </form>
        </div>
      ) : null}

      {!error && merchants.length === 0 ? (
        <div className="admin-empty">{access.isAdmin ? "No business has been tagged yet. Tag the first one to start a pilot." : "No business has been assigned to you yet. An admin gives you one on the Team page."}</div>
      ) : shown.length === 0 ? (
        <div className="admin-empty">No business matches{query.q ? ` "${query.q}"` : ""}{query.stage !== "all" ? ` in ${FILTER_LABELS[query.stage]}` : ""}.</div>
      ) : (
        <div className="admin-list">
          {shown.map((m) => {
            const stage = stageInfo(stages.rows.get(m.id));
            return (
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
                <span className={`sync-pill ${stage.stage === "wip" ? "waiting" : stage.stage === "active" ? "done" : ""}`} title={stageLine(stage)}>
                  {stage.known ? STAGE_LABELS[stage.stage] : "No stage"}
                </span>
                {stage.stage === "wip" ? <span className="admin-row-meta">Day {stage.day} of {stage.total}</span> : null}
                <a className="btn-outline" href={`/discussions/${m.topic_slug}`}>View thread</a>
                <a className="btn-outline" href={`/admin/sync/${m.id}`}>Open</a>
              </div>
            </div>
            );
          })}
        </div>
      )}
      {stages.failed ? <div className="admin-banner" role="status">The stages could not be read. Has the Sync migration 0026 been run?</div> : null}
    </div>
  );
}
