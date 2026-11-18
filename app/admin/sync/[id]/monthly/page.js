import { notFound } from "next/navigation";

import MonthlyView from "./MonthlyView";
import PrintButton from "../../../../report/PrintButton";
import { NOINDEX_NOFOLLOW } from "../../../../../lib/seo/indexable";
import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import { getMerchantById } from "../../../../../lib/sync/merchants";
import { lastMonth, listNumbers, monthLabel, parseMonth } from "../../../../../lib/sync/googleNumbers";
import { listChecks } from "../../../../../lib/sync/health";
import { listPosts } from "../../../../../lib/sync/posts";
import { listReplies } from "../../../../../lib/sync/replies";
import { listTasks } from "../../../../../lib/sync/tasks";
import { buildMonthly } from "../../../../../lib/sync/monthly";
import { nepalDay } from "../../../../../lib/sync/time";
import "../../../../report/report.css";

export const metadata = { title: "Monthly report - KastoChha Admin", robots: NOINDEX_NOFOLLOW };
export const dynamic = "force-dynamic";

// What the owner gets once a month, for the team to check and print. Admins only. Nothing is stored or sent from here.
export default async function MonthlyReportPage({ params, searchParams }) {
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
  const { merchant, error } = await getMerchantById(params.id);
  if (error) {
    return <div className="admin-page"><div className="admin-banner" role="alert">Could not load that business.</div></div>;
  }
  if (!merchant) notFound();

  const today = nepalDay(Date.now());
  const asked = Array.isArray(searchParams?.month) ? searchParams.month[0] : searchParams?.month;
  const month = (parseMonth(asked) || parseMonth(lastMonth(today))).slice(0, 7);

  const supabase = createServerSupabase();
  let data;
  try {
    const [numbers, checks, posts, replies, tasks] = await Promise.all([
      listNumbers(supabase, merchant.id),
      listChecks(supabase, merchant.id, 60),
      listPosts(supabase, merchant.id),
      listReplies(supabase, merchant.id),
      listTasks(supabase, { merchantIds: [merchant.id] })
    ]);
    data = { numbers, checks, posts, replies, tasks };
  } catch (failure) {
    console.error("Sync monthly report failed:", failure?.message || failure);
    return (
      <div className="admin-page">
        <div className="admin-banner" role="alert">Could not load what the report needs. Have migrations 0030 to 0033 been run?</div>
        <a className="btn-outline" href={`/admin/sync/${merchant.id}?tab=google`}>Back to Google</a>
      </div>
    );
  }
  const report = buildMonthly({ merchant, month, ...data });
  const monthsWithNumbers = data.numbers.map((row) => String(row.month).slice(0, 7)).slice(0, 6);
  return (
    <main className="rp-wrap">
      <header className="rp-bar">
        <a className="rp-btn" href={`/admin/sync/${merchant.id}?tab=google`}>Back to Google</a>
        <div className="rp-switch">
          {monthsWithNumbers.map((m) => <a key={m} className={`rp-btn${m === month ? " on" : ""}`} href={`/admin/sync/${merchant.id}/monthly?month=${m}`}>{monthLabel(`${m}-01`)}</a>)}
          <PrintButton />
        </div>
      </header>
      {!report.hasNumbers ? <div className="admin-banner rp-noprint" role="status">No Google figures are typed in for {report.label}. Add them on the Google tab, then open this page again.</div> : null}
      {report.note ? <div className="admin-banner rp-noprint" role="status">The note you typed with the numbers is printed. Check it is fit for the owner to read.</div> : null}
      <MonthlyView report={report} dateLabel={`Made ${today}`} />
    </main>
  );
}
