import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../lib/admin/audit";
import { adminSaveMessage, logDbError } from "../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../lib/requestBody";
import { findSamePlace, validateNewProspect } from "../../../../../lib/sync/prospects";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

// Add a prospect: a business we are about to pitch. Admin only. A place that is already a prospect, or already a business on
// KastoChha, is refused, so it is never pitched twice by accident.
export async function POST(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const { values, error: validationError } = validateNewProspect(parsed.data);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const supabase = createServerSupabase();
  try {
    const same = await findSamePlace(supabase, values.match_key);
    if (same) {
      return NextResponse.json(
        { error: same.kind === "business" ? `${same.name} is already a business on KastoChha.` : `${same.name} is already on the audit list.`, existing: same },
        { status: 409 }
      );
    }
  } catch (error) {
    logDbError("sync prospect check", error);
    return NextResponse.json({ error: "Could not check the list. Has migration 0027 been run?" }, { status: 500 });
  }

  const row = { id: crypto.randomUUID(), ...values, created_by: authResult.userId, updated_by: authResult.userId };
  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: "sync.prospect.create",
      targetType: "sync_prospect",
      targetId: row.id,
      before: null,
      after: { id: row.id, business_name: row.business_name, area: row.area, business_kind: row.business_kind, status: row.status }
    });
  } catch (auditError) {
    console.error("sync prospect create:", auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }

  const { data, error: dbError } = await supabase.from("sync_prospects").insert(row).select().single();
  if (dbError) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError("sync prospect create", dbError);
    return NextResponse.json({ error: adminSaveMessage(dbError) }, { status: 500 });
  }
  await closeAuditEntry(supabase, auditId, { applied: true });
  return NextResponse.json({ prospect: { id: data.id } }, { status: 201 });
}
