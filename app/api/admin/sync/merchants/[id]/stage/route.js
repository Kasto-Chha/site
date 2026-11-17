import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../../../lib/admin/audit";
import { logDbError } from "../../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../../lib/requestBody";
import { planMove, stageInfo } from "../../../../../../../lib/sync/stage";
import { readStage, writeStage } from "../../../../../../../lib/sync/stageStore";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";
const KEPT = ["stage", "trial_started_on", "trial_ends_on"];
const pick = (row) => Object.fromEntries(KEPT.map((k) => [k, row?.[k] ?? null]));

// Move a business between stages: make it Active (paying), move it to Free, start a trial again, or change a trial's end
// date. Admin only, and every move is recorded. The audit log keeps the stage and the dates, never the note's words.
export async function PUT(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  if (!UUID_RE.test(params.id || "")) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;

  const supabase = createServerSupabase();
  let current;
  try {
    current = await readStage(supabase, params.id);
  } catch (error) {
    logDbError("sync stage read", error);
    return NextResponse.json({ error: "Could not read the stage. Has migration 0026 been run?" }, { status: 500 });
  }
  if (!current) return NextResponse.json({ error: "Business not found." }, { status: 404 });

  const plan = planMove(current, parsed.data);
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });

  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: `sync.stage.${plan.action}`,
      targetType: "sync_merchant",
      targetId: params.id,
      before: pick(current),
      after: pick({ ...current, ...plan.values })
    });
  } catch (auditError) {
    console.error("sync stage:", auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }

  let saved;
  try {
    saved = await writeStage(supabase, params.id, current.stage, { ...plan.values, stage_changed_by: authResult.userId });
  } catch (error) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError("sync stage write", error);
    return NextResponse.json({ error: "Could not save the change. Please try again." }, { status: 500 });
  }
  if (!saved) {
    // Someone moved this business a moment ago. Nothing was changed here.
    await closeAuditEntry(supabase, auditId, { applied: false });
    return NextResponse.json({ error: "This business was changed a moment ago. Reload the page and try again." }, { status: 409 });
  }
  await closeAuditEntry(supabase, auditId, { applied: true, after: pick(saved) });
  return NextResponse.json({ ok: true, stage: stageInfo(saved) });
}
