import { NOINDEX_NOFOLLOW } from "../../../lib/seo/indexable";
import { requireRole, ROLE } from "../../../lib/auth/roles";
import { createServerSupabase } from "../../../lib/supabase/server";
import { formatCount, loadOverview, parseRange } from "../../../lib/sync/overview";
import { countLabel } from "../../../lib/sync/text";
import { ActivityBars, BusinessTable, RangeTabs, ScansChart, StatTile, TopCodes } from "./OverviewParts";

export const metadata = {
  title: "Sync overview - KastoChha Admin",
  robots: NOINDEX_NOFOLLOW
};

// Always read fresh: the point of this page is what happened today.
export const dynamic = "force-dynamic";

// A page of rows is plenty for a pilot; beyond it the list says so and points at the full one.
const TABLE_LIMIT = 25;

export default async function SyncOverviewPage({ searchParams }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync">Sign in</a>
      </div>
    );
  }

  const range = parseRange(searchParams?.range);
  const now = Date.now();
  let data = null;
  let error = "";
  try {
    data = await loadOverview(createServerSupabase(), { range, now });
  } catch (loadError) {
    // Never shown as zeros: a page full of zeros reads as "nothing is happening".
    console.error("Sync overview failed:", loadError?.message || loadError);
    error = "Could not load the overview. Nothing below is shown, so it cannot be mistaken for no activity. Try again in a moment.";
  }

  return (
    <>
      <div className="ov-head">
        <div>
          <div className="page-kicker">SYNC</div>
          <h1>Overview</h1>
          <p>{data ? data.rangeLabel : "Overview"} · Days are counted in Nepal time.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <RangeTabs range={range} />
          <a className="btn-red" href="/admin/sync/new">Tag a business</a>
        </div>
      </div>

      {error ? <div className="ov-banner" role="alert">{error}</div> : null}
      {data?.truncated ? <div className="ov-banner" role="status">Some counts are partial: there are more records than can be read in one go. Treat the totals as a minimum.</div> : null}

      {data && data.activeBusinesses === 0 ? (
        <div className="ov-card ov-empty">
          <div>No business has been tagged yet. Tag the first one to start a pilot.</div>
          <a className="btn-red" href="/admin/sync/new">Tag a business</a>
        </div>
      ) : null}

      {data && data.activeBusinesses > 0 ? (
        <>
          <div className="ov-tiles">
            <StatTile
              label="Active businesses"
              value={formatCount(data.activeBusinesses)}
              sub={data.withoutActiveCode > 0 ? `${countLabel(data.withoutActiveCode, "business", "businesses")} without a working QR code` : "All have a working QR code"}
              warn={data.withoutActiveCode > 0}
            />
            <StatTile label="QR scans" value={formatCount(data.totals.scans)} sub={data.rangeLabel} />
            <StatTile
              label="Hub taps"
              value={formatCount(data.totals.tapsTotal)}
              sub={`Share ${formatCount(data.totals.taps.share)} · Google ${formatCount(data.totals.taps.google)} · Maps ${formatCount(data.totals.taps.maps)}`}
            />
            <StatTile label="Website badge opens" value={formatCount(data.totals.badge.open)} sub={`${formatCount(data.totals.badgeClicks)} clicked a link`} />
            <StatTile
              label="Posts"
              value={formatCount(data.totals.postsTotal)}
              sub={`${countLabel(data.totals.posts.experiences, "experience", "experiences")} · ${countLabel(data.totals.posts.questions, "question", "questions")}`}
            />
          </div>

          <section className="ov-section">
            <div className="ov-section-head">
              <h2>Businesses</h2>
              <a href="/admin/sync/businesses">All businesses &rarr;</a>
            </div>
            <p className="ov-note" style={{ margin: 0 }}>
              {data.needAttention > 0 ? `${countLabel(data.needAttention, "business needs", "businesses need")} attention, shown first.` : "Nothing needs attention."} Counts are for the range above; the status always looks at the last 7 days.
            </p>
            <BusinessTable rows={data.rows.slice(0, TABLE_LIMIT)} rangeLabel={data.rangeLabel} now={now} />
            {data.rows.length > TABLE_LIMIT ? (
              <p className="ov-note" style={{ margin: 0 }}>Showing {TABLE_LIMIT} of {data.rows.length}. <a href="/admin/sync/businesses">See all businesses</a>.</p>
            ) : null}
          </section>

          <div className="ov-two">
            <div className="ov-col">
              <section className="ov-section">
                <h2>Scans per day</h2>
                <div className="ov-card ov-pad">
                  <ScansChart daily={data.daily} />
                  {data.daily.every((d) => d.scans === 0) ? <p className="ov-note">No scans in the last {data.daily.length} days.</p> : null}
                </div>
              </section>
              <section className="ov-section">
                <h2>Most scanned QR codes</h2>
                <div className="ov-card ov-pad">
                  <TopCodes codes={data.topCodes} />
                </div>
              </section>
            </div>
            <section className="ov-section">
              <h2>Hub and badge activity</h2>
              <div className="ov-card ov-pad">
                <ActivityBars totals={data.totals} />
              </div>
            </section>
          </div>
        </>
      ) : null}
    </>
  );
}
