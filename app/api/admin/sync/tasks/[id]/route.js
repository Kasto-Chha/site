import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../../lib/supabase/server";
import { BODY_LIMITS, readJsonBody } from "../../../../../../lib/requestBody";
import { logDbError } from "../../../../../../lib/dbError";
import { syncAccess } from "../../../../../../lib/sync/access";
import { assigneeAllowed, canSee, scopeFor } from "../../../../../../lib/sync/taskAccess";
import { deleteTask, getTask, isUuid, updateTask, validateTaskPatch, withStatusStamps } from "../../../../../../lib/sync/tasks";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const denied = (access) => NextResponse.json({ error: "Unauthorized" }, { status: access.status });
const notFound = () => NextResponse.json({ error: "Task not found." }, { status: 404 });

// Change a task: its title, details, type, person, due date, urgent flag or status. An operator can only change tasks
// of businesses assigned to them. A task they may not see is "not found", exactly like one that does not exist.
export async function PATCH(request, { params }) {
  const access = await syncAccess();
  if (!access.ok) return denied(access);
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const parsed = await readJsonBody(request, BODY_LIMITS.form);
  if (parsed.response) return parsed.response;
  const { values, error: invalid } = validateTaskPatch(parsed.data);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const supabase = createServerSupabase();
  try {
    const scope = await scopeFor(supabase, access);
    const current = await getTask(supabase, params.id);
    if (!current || !canSee(scope, current.merchant_id)) return notFound();
    if ("assignee_user_id" in values && !(await assigneeAllowed(supabase, access, values.assignee_user_id, current.merchant_id))) {
      return NextResponse.json({ error: access.isAdmin ? "That person cannot be given tasks for this business." : "You can only give a task to yourself." }, { status: 400 });
    }
    const task = await updateTask(supabase, params.id, withStatusStamps(values, current));
    return NextResponse.json({ task });
  } catch (error) {
    logDbError("sync tasks update", error);
    return NextResponse.json({ error: "Could not save the task." }, { status: 500 });
  }
}

// Remove a task made by mistake. Admins only: an operator marks it Done instead.
export async function DELETE(request, { params }) {
  const access = await syncAccess();
  if (!access.ok) return denied(access);
  if (!access.isAdmin) return NextResponse.json({ error: "Only an admin can delete a task." }, { status: 403 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  try {
    const supabase = createServerSupabase();
    if (!(await getTask(supabase, params.id))) return notFound();
    await deleteTask(supabase, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logDbError("sync tasks delete", error);
    return NextResponse.json({ error: "Could not remove the task." }, { status: 500 });
  }
}
