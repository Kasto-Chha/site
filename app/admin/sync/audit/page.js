import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";
import { createServerSupabase } from "../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../lib/auth/roles";
import { kindDisplay } from "../../../../lib/sync/businessTypes";
import { scoreFacts } from "../../../../lib/sync/audit";
import { FILTERS, FILTER_LABELS, STATUS_LABELS, filterCounts, filterProspects, listHref, listProspects, nextStep, parseListQuery } from "../../../../lib/sync/prospects";

export const metadata = { title: "Audit - KastoChha Admin", robots: NOINDEX_NOFOLLOW };
export const dynamic = "force-dynamic";

// The businesses we are about to pitch: each gets a Google profile audit. Admins only.
export default async function AuditListPage({ searchParams }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync/audit">Sign in</a>
      </div>
    );
  }

  let prospects = [];
  let error = "";
  try {
    prospects = await listProspects(createServerSupabase());
  } catch {
    error = "Could not load the audits. Has migration 0027 been run?";
  }
  const query = parseListQuery(searchParams);
  const counts = filterCounts(prospects, query.q);
  const shown = filterProspects(prospects, query);

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <div className="page-kicker">SYNC</div>
          <h1>Audit</h1>
          <p className="admin-sub">
            A free Google profile audit for a business we want to approach. You type in what its public Google profile shows,
            the page works out the score and the five fixes, and you send the report.
          </p>
        </div>
        <div className="admin-actions">
          <a className="btn-outline" href="/admin/sync/audit/settings">Report settings</a>
          <a className="btn-red" href="/admin/sync/audit/new">New audit</a>
        </div>
      </div>

      {error ? <div className="admin-banner">{error}</div> : null}

      {prospects.length > 0 ? (
        <div className="sync-filters">
          <div className="sync-chips" role="group" aria-label="Filter by status">
            {FILTERS.map((key) => (
              <a key={key} className={`sync-chip${query.status === key ? " on" : ""}`} href={listHref(key, query.q)} aria-current={query.status === key ? "true" : undefined}>
                {FILTER_LABELS[key]} <span>{counts[key]}</span>
              </a>
            ))}
          </div>
          <form className="sync-search" method="get" action="/admin/sync/audit" role="search">
            {query.status !== "all" ? <input type="hidden" name="status" value={query.status} /> : null}
            <input className="admin-input" type="search" name="q" defaultValue={query.q} placeholder="Search by name or area" maxLength={80} aria-label="Search audits" />
            <button className="btn-outline" type="submit">Search</button>
            {query.q ? <a className="btn-outline" href={listHref(query.status, "")}>Clear</a> : null}
          </form>
        </div>
      ) : null}

      {!error && prospects.length === 0 ? (
        <div className="admin-empty">No audit yet. Start one for the first business you want to approach.</div>
      ) : shown.length === 0 ? (
        <div className="admin-empty">No audit matches{query.q ? ` "${query.q}"` : ""}{query.status !== "all" ? ` in ${FILTER_LABELS[query.status]}` : ""}.</div>
      ) : (
        <div className="admin-list">
          {shown.map((p) => {
            const scored = scoreFacts(p.facts);
            return (
              <div className="admin-row" key={p.id}>
                <div>
                  <div className="admin-row-title">{p.business_name}, {p.area}</div>
                  <div className="admin-row-meta">
                    {kindDisplay(p.business_kind, p.kind_label)} · {scored.score === null ? "No score yet" : `Score ${scored.score}/100`} · Next: {nextStep(p)}
                  </div>
                </div>
                <div className="admin-row-actions">
                  <span className={`sync-pill ${p.status === "tagged" || p.status === "replied" ? "done" : p.status === "declined" ? "" : "waiting"}`}>{STATUS_LABELS[p.status]}</span>
                  <a className="btn-outline" href={p.merchant_id ? `/admin/sync/${p.merchant_id}` : `/admin/sync/audit/${p.id}`}>{p.merchant_id ? "Open business" : "Open"}</a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
