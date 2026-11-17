import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../../lib/admin/audit";
import { logDbError } from "../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../lib/requestBody";
import { findSamePlace, getProspect, planProspect } from "../../../../../../lib/sync/prospects";
import { nepalDay } from "../../../../../../lib/sync/time";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";
// The log keeps the ids and the status, never the facts or the drafts' words.
const brief = (row) => ({ status: row.status, business_name: row.business_name, area: row.area, merchant_id: row.merchant_id ?? null });

// Change a prospect: its details, its facts and drafts, make the report, record that it was sent, replied or said no. Admin
// only. Every change is recorded.
export async function PUT(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  if (!UUID_RE.test(params.id || "")) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;

  const supabase = createServerSupabase();
  let current;
  try {
    current = await getProspect(supabase, params.id);
  } catch (error) {
    logDbError("sync prospect read", error);
    return NextResponse.json({ error: "Could not read the prospect. Has migration 0027 been run?" }, { status: 500 });
  }

  const plan = planProspect(current, parsed.data, nepalDay(Date.now()));
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });

  // Renaming must not make it the same place as another prospect or a business.
  if (plan.values.match_key && plan.values.match_key !== current.match_key) {
    try {
      const same = await findSamePlace(supabase, plan.values.match_key, current.id);
      if (same) return NextResponse.json({ error: same.kind === "business" ? `${same.name} is already a business on KastoChha.` : `${same.name} is already on the audit list.` }, { status: 409 });
    } catch (error) {
      logDbError("sync prospect check", error);
      return NextResponse.json({ error: "Could not check the list." }, { status: 500 });
    }
  }

  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: `sync.prospect.${plan.action}`,
      targetType: "sync_prospect",
      targetId: params.id,
      before: brief(current),
      after: brief({ ...current, ...plan.values })
    });
  } catch (auditError) {
    console.error("sync prospect:", auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }

  // Only if it is still in the status the change was worked out from: two people pressing at once cannot overwrite each other.
  const { data, error: dbError } = await supabase
    .from("sync_prospects")
    .update({ ...plan.values, updated_by: authResult.userId, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("status", current.status)
    .select("id, status");
  if (dbError) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError("sync prospect write", dbError);
    return NextResponse.json({ error: "Could not save the change. Please try again." }, { status: 500 });
  }
  if (!data || data.length === 0) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    return NextResponse.json({ error: "This prospect was changed a moment ago. Reload the page and try again." }, { status: 409 });
  }
  await closeAuditEntry(supabase, auditId, { applied: true });
  return NextResponse.json({ ok: true, status: data[0].status });
}

// Remove a prospect from the list for good (one added by mistake). Admin only, recorded. A business already tagged from it is
// not touched.
export async function DELETE(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  if (!UUID_RE.test(params.id || "")) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const supabase = createServerSupabase();
  let current;
  try {
    current = await getProspect(supabase, params.id);
  } catch (error) {
    logDbError("sync prospect read", error);
    return NextResponse.json({ error: "Could not read the prospect." }, { status: 500 });
  }
  if (!current) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: "sync.prospect.delete",
      targetType: "sync_prospect",
      targetId: params.id,
      before: brief(current),
      after: null
    });
  } catch (auditError) {
    console.error("sync prospect delete:", auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }
  const removed = await supabase.from("sync_prospects").delete().eq("id", params.id).select("id");
  if (removed.error) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError("sync prospect delete", removed.error);
    return NextResponse.json({ error: "Could not remove it. Nothing was changed." }, { status: 500 });
  }
  if (!removed.data || removed.data.length === 0) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  await closeAuditEntry(supabase, auditId, { applied: true });
  return NextResponse.json({ ok: true });
}
