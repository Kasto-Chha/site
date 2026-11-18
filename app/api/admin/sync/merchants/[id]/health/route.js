import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../../../lib/supabase/server";
import { syncAccess } from "../../../../../../../lib/sync/access";
import { isAssigned } from "../../../../../../../lib/sync/team";
import { closeAuditEntry, openAuditEntry } from "../../../../../../../lib/admin/audit";
import { logDbError } from "../../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../../lib/requestBody";
import { CHECK_KEYS, cleanHealthFacts, evaluate, listChecks, saveCheck, taskFor } from "../../../../../../../lib/sync/health";
import { createTask, listTasks, validateNewTask } from "../../../../../../../lib/sync/tasks";
import { stageInfo } from "../../../../../../../lib/sync/stage";
import { readStage } from "../../../../../../../lib/sync/stageStore";
import { nepalDay } from "../../../../../../../lib/sync/time";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";
const FREE = "This business is on the Free plan: we do not work on its Google profile, so no checks are entered.";

// An admin may use this for any business; an operator only for one assigned to them (an unassigned one looks like it does not
// exist). A Free business is held. A stage that cannot be read never blocks.
async function gate(params) {
  const authResult = await syncAccess();
  if (!authResult.ok) return { response: NextResponse.json({ error: "Unauthorized" }, { status: authResult.status }) };
  if (!UUID_RE.test(params.id || "")) return { response: NextResponse.json({ error: "Invalid id." }, { status: 400 }) };
  const supabase = createServerSupabase();
  if (!authResult.isAdmin && !(await isAssigned(supabase, authResult.userId, params.id))) return { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  const found = await supabase.from("sync_merchants").select("id").eq("id", params.id).maybeSingle();
  if (found.error) {
    logDbError("sync health merchant", found.error);
    return { response: NextResponse.json({ error: "Could not load that business." }, { status: 500 }) };
  }
  if (!found.data) return { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  try {
    const info = stageInfo(await readStage(supabase, params.id));
    if (info.known && info.stage === "free") return { response: NextResponse.json({ error: FREE }, { status: 409 }) };
  } catch {
    // Not blocked by a failed read.
  }
  return { authResult, supabase };
}

async function logged(supabase, authResult, action, merchantId, after, work) {
  let auditId;
  try {
    auditId = await openAuditEntry(supabase, { actorId: authResult.userId, action, targetType: "sync_merchant", targetId: merchantId, before: null, after });
  } catch (auditError) {
    console.error(`${action}:`, auditError.message);
    return { response: NextResponse.json({ error: AUDIT_FAILED }, { status: 500 }) };
  }
  try {
    const result = await work();
    await closeAuditEntry(supabase, auditId, { applied: true });
    return { result };
  } catch (error) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError(action, error);
    return { response: NextResponse.json({ error: "Could not save. Has migration 0031 been run?" }, { status: 500 }) };
  }
}

// Check again: a new snapshot of what the public profile shows today. The counts are worked out here from the answers.
export async function PUT(request, { params }) {
  const g = await gate(params);
  if (g.response) return g.response;
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const { facts, error } = cleanHealthFacts(parsed.data?.facts);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (Object.keys(facts).length === 0) return NextResponse.json({ error: "Answer at least one question." }, { status: 400 });
  const preview = evaluate(facts);
  const done = await logged(g.supabase, g.authResult, "sync.health.save", params.id, { passing: preview.passing, failing: preview.failing, unknown: preview.unknown, score: preview.score }, () => saveCheck(g.supabase, params.id, facts, nepalDay(Date.now()), g.authResult.userId));
  if (done.response) return done.response;
  return NextResponse.json({ ok: true, score: done.result.result.score });
}

// Make tasks from the gaps of the latest check: { keys: ["festival", ...] } or { keys: "all" }. A gap that already has an open task
// is skipped, so pressing twice never doubles the list.
export async function POST(request, { params }) {
  const g = await gate(params);
  if (g.response) return g.response;
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const wanted = parsed.data?.keys;
  if (wanted !== "all" && !(Array.isArray(wanted) && wanted.length > 0 && wanted.length <= CHECK_KEYS.length && wanted.every((key) => CHECK_KEYS.includes(key)))) {
    return NextResponse.json({ error: "Choose which checks to make tasks from." }, { status: 400 });
  }

  let latest;
  let open;
  try {
    latest = (await listChecks(g.supabase, params.id, 1))[0];
    open = new Set((await listTasks(g.supabase, { merchantIds: [params.id] })).filter((t) => t.status !== "done").map((t) => t.title));
  } catch (readError) {
    logDbError("sync health read", readError);
    return NextResponse.json({ error: "Could not read the latest check." }, { status: 500 });
  }
  if (!latest) return NextResponse.json({ error: "Check the profile first." }, { status: 409 });

  // Only gaps of the latest check count, whatever the browser sent.
  const gaps = evaluate(latest.facts).results.filter((r) => r.state === "fix" && (wanted === "all" || wanted.includes(r.key)));
  const fresh = gaps.filter((r) => !open.has(taskFor(r).title));
  if (fresh.length === 0) return NextResponse.json({ ok: true, created: 0, skipped: gaps.length });

  const done = await logged(g.supabase, g.authResult, "sync.health.tasks", params.id, { checks: fresh.map((r) => r.key) }, async () => {
    for (const result of fresh) {
      const task = taskFor(result);
      const { values, error } = validateNewTask({ merchantId: params.id, title: task.title, details: task.details, type: task.type });
      if (error) throw new Error(error);
      await createTask(g.supabase, values, g.authResult.userId);
    }
    return fresh.length;
  });
  if (done.response) return done.response;
  return NextResponse.json({ ok: true, created: done.result, skipped: gaps.length - fresh.length });
}
