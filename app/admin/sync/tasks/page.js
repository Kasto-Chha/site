import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";
import { describeClerkUser, getClerkUser } from "../../../../lib/auth/clerk";
import { createServerSupabase } from "../../../../lib/supabase/server";
import { syncAccess } from "../../../../lib/sync/access";
import { scopeFor } from "../../../../lib/sync/taskAccess";
import { listTasks, nepalToday, sortTasks } from "../../../../lib/sync/tasks";
import { listAssignments } from "../../../../lib/sync/team";
import TasksClient from "./TasksClient";

export const metadata = { title: "Sync tasks - KastoChha Admin", robots: NOINDEX_NOFOLLOW };
export const dynamic = "force-dynamic";

// The team's to-do list. An admin sees every task; an operator sees only the tasks of the businesses assigned to them.
export default async function TasksPage() {
  const access = await syncAccess();
  if (!access.ok) {
    return (
      <div className="admin-page">
        <h1>Team access required</h1>
        <p>You need to be on the KastoChha team to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync/tasks">Sign in</a>
      </div>
    );
  }

  const supabase = createServerSupabase();
  let tasks = [];
  let merchants = [];
  let people = [];
  let error = "";
  try {
    const scope = await scopeFor(supabase, access);
    tasks = sortTasks(await listTasks(supabase, { merchantIds: scope }));
    let query = supabase.from("sync_merchants").select("id, business_name, area, status").order("business_name", { ascending: true }).limit(500);
    if (scope) query = query.in("id", scope.length ? scope : ["00000000-0000-0000-0000-000000000000"]);
    const found = await query;
    if (found.error) throw found.error;
    merchants = found.data || [];

    // Who a task can be given to. Everyone can give a task to themselves; an admin can also give it to an operator.
    people = [{ id: access.userId, label: "Me" }];
    if (access.isAdmin) {
      const operatorIds = [...new Set((await listAssignments(supabase)).map((row) => row.operator_user_id))].filter((id) => id !== access.userId);
      for (const id of operatorIds) {
        let label = "An operator";
        try {
          const user = describeClerkUser(await getClerkUser(id));
          label = user?.name || user?.email || label;
        } catch {
          // The name could not be read just now: the task can still be given to them.
        }
        people.push({ id, label, operatorId: id });
      }
    }
  } catch (failure) {
    console.error("Sync tasks page failed:", failure?.message || failure);
    error = "Could not load the tasks.";
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <div className="page-kicker">SYNC</div>
          <h1>Tasks</h1>
          <p className="admin-sub">Every request and fix in one list: what to do, for which business, who does it, and by when.</p>
        </div>
      </div>
      {error ? <div className="admin-banner" role="alert">{error}</div> : null}
      <TasksClient initialTasks={tasks} merchants={merchants} people={people} today={nepalToday()} isAdmin={access.isAdmin} meId={access.userId} />
    </div>
  );
}
