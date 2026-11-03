import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { createServerSupabase } from "../../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../../lib/admin/audit";
import { adminSaveMessage, logDbError } from "../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../lib/requestBody";
import { validateUpdate } from "../../../../../../lib/sync/validate";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

// Edit a tagged business's details, or remove its business tag (status "cancelled")
// or restore it. The two addresses are fixed once tagged. A removed tag keeps the
// thread and every post; only the business header and extras go.
export async function PUT(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  }
  if (!UUID_RE.test(params.id || "")) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;

  const supabase = createServerSupabase();
  const context = "admin sync update merchant";

  const found = await supabase.from("sync_merchants").select("*").eq("id", params.id).maybeSingle();
  if (found.error) {
    logDbError(context, found.error);
    return NextResponse.json({ error: "Could not load that business." }, { status: 500 });
  }
  if (!found.data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { values, error: validationError } = validateUpdate(parsed.data, found.data);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: values.status && values.status !== found.data.status ? `sync.merchant.${values.status === "cancelled" ? "remove" : "restore"}` : "sync.merchant.update",
      targetType: "sync_merchant",
      targetId: params.id,
      before: found.data,
      after: { ...found.data, ...values }
    });
  } catch (auditError) {
    console.error(`${context}:`, auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }

  const { data, error: dbError } = await supabase.from("sync_merchants").update(values).eq("id", params.id).select().single();
  if (dbError) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError(context, dbError);
    return NextResponse.json({ error: adminSaveMessage(dbError) }, { status: 500 });
  }
  await closeAuditEntry(supabase, auditId, { applied: true, after: data });

  revalidatePath(`/discussions/${data.topic_slug}`);
  revalidatePath("/discussions");
  return NextResponse.json({ merchant: data });
}
