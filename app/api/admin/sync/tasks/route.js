import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../lib/supabase/server";
import { BODY_LIMITS, readJsonBody } from "../../../../../lib/requestBody";
import { logDbError } from "../../../../../lib/dbError";
import { syncAccess } from "../../../../../lib/sync/access";
import { canSee, assigneeAllowed, scopeFor } from "../../../../../lib/sync/taskAccess";
import { createTask, listTasks, nepalToday, sortTasks, validateNewTask } from "../../../../../lib/sync/tasks";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const denied = (access) => NextResponse.json({ error: "Unauthorized" }, { status: access.status });

// The team's tasks. An admin gets all of them; an operator gets only the tasks of the businesses assigned to them.
export async function GET() {
  const access = await syncAccess();
  if (!access.ok) return denied(access);
  const supabase = createServerSupabase();
  try {
    const scope = await scopeFor(supabase, access);
    const tasks = await listTasks(supabase, { merchantIds: scope });
    return NextResponse.json({ tasks: sortTasks(tasks), today: nepalToday() });
  } catch (error) {
    logDbError("sync tasks list", error);
    return NextResponse.json({ error: "Could not load the tasks." }, { status: 500 });
  }
}

// A new task. An operator may only make one for a business assigned to them, and only for themselves or nobody.
export async function POST(request) {
  const access = await syncAccess();
  if (!access.ok) return denied(access);

  const parsed = await readJsonBody(request, BODY_LIMITS.form);
  if (parsed.response) return parsed.response;
  const { values, error: invalid } = validateNewTask(parsed.data);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  if (values.source === "note" && !access.isAdmin) {
    return NextResponse.json({ error: "Only an admin can make a task from a private note." }, { status: 403 });
  }

  const supabase = createServerSupabase();
  try {
    const scope = await scopeFor(supabase, access);
    const found = await supabase.from("sync_merchants").select("id").eq("id", values.merchant_id).maybeSingle();
    if (found.error) throw found.error;
    // Not assigned looks exactly like not existing: it does not confirm that a business exists.
    if (!found.data || !canSee(scope, values.merchant_id)) return NextResponse.json({ error: "Business not found." }, { status: 404 });
    if (!(await assigneeAllowed(supabase, access, values.assignee_user_id, values.merchant_id))) {
      return NextResponse.json({ error: access.isAdmin ? "That person cannot be given tasks for this business." : "You can only give a task to yourself." }, { status: 400 });
    }
    const task = await createTask(supabase, values, access.userId);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    logDbError("sync tasks create", error);
    return NextResponse.json({ error: "Could not save the task." }, { status: 500 });
  }
}
