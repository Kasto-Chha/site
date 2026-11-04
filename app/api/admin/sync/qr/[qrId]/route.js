import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../../lib/admin/audit";
import { adminSaveMessage, logDbError } from "../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../lib/requestBody";
import { LABEL_MAX, cleanLabel } from "../../../../../../lib/sync/qr";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

// Rename a QR code, or switch it off or on. Admin only. The code itself never changes: it is
// printed on a table, so the only way to retire one is to switch it off and make a new one.
export async function PUT(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  if (!UUID_RE.test(params.qrId || "")) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const body = parsed.data || {};

  const values = {};
  if (body.label !== undefined) {
    const label = cleanLabel(body.label);
    if (!label) return NextResponse.json({ error: "Give the code a label, for example Table 4." }, { status: 400 });
    if (label.length > LABEL_MAX) return NextResponse.json({ error: `The label can be at most ${LABEL_MAX} characters.` }, { status: 400 });
    values.label = label;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return NextResponse.json({ error: "Active must be true or false." }, { status: 400 });
    values.active = body.active;
  }
  if (Object.keys(values).length === 0) return NextResponse.json({ error: "There is nothing to change." }, { status: 400 });

  const supabase = createServerSupabase();
  const context = "admin sync update qr";

  const found = await supabase.from("sync_qr_codes").select("*").eq("id", params.qrId).maybeSingle();
  if (found.error) {
    logDbError(context, found.error);
    return NextResponse.json({ error: "Could not load that code." }, { status: 500 });
  }
  if (!found.data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: values.active !== undefined && values.active !== found.data.active ? `sync.qr.${values.active ? "switch_on" : "switch_off"}` : "sync.qr.update",
      targetType: "sync_qr_code",
      targetId: params.qrId,
      before: found.data,
      after: { ...found.data, ...values }
    });
  } catch (auditError) {
    console.error(`${context}:`, auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }

  const { data, error } = await supabase.from("sync_qr_codes").update(values).eq("id", params.qrId).select().single();
  if (error) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError(context, error);
    return NextResponse.json({ error: adminSaveMessage(error) }, { status: 500 });
  }
  await closeAuditEntry(supabase, auditId, { applied: true, after: data });
  return NextResponse.json({ qr: data });
}
