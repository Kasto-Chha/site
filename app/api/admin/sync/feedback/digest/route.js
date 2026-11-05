import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../../lib/admin/audit";
import { adminSaveMessage, logDbError } from "../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../lib/requestBody";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

// "Mark all sent": the team has sent a business its digest, so that business's new notes become "in digest".
// Only that business's NEW notes, only those: a note that is already resolved or already sent stays as it is.
// Admin only, one audit entry for the whole batch (the ids, never the words).
export async function POST(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const merchantId = parsed.data?.merchantId;
  if (typeof merchantId !== "string" || !UUID_RE.test(merchantId)) return NextResponse.json({ error: "Invalid business." }, { status: 400 });

  const supabase = createServerSupabase();
  const context = "admin sync feedback digest sent";
  const waiting = await supabase.from("sync_feedback").select("id").eq("merchant_id", merchantId).eq("status", "new");
  if (waiting.error) {
    logDbError(context, waiting.error);
    return NextResponse.json({ error: "Could not load the notes." }, { status: 500 });
  }
  const ids = (waiting.data || []).map((row) => row.id);
  if (ids.length === 0) return NextResponse.json({ updated: 0, ids: [] });

  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: "sync.feedback.digest_sent",
      targetType: "sync_merchant",
      targetId: merchantId,
      before: { status: "new", note_ids: ids },
      after: { status: "in_digest", note_ids: ids }
    });
  } catch (auditError) {
    console.error(`${context}:`, auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }

  const { data, error } = await supabase.from("sync_feedback").update({ status: "in_digest", handled_at: null }).eq("merchant_id", merchantId).eq("status", "new").select("id");
  if (error) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError(context, error);
    return NextResponse.json({ error: adminSaveMessage(error) }, { status: 500 });
  }
  const updated = (data || []).map((row) => row.id);
  await closeAuditEntry(supabase, auditId, { applied: true, after: { status: "in_digest", note_ids: updated } });
  return NextResponse.json({ updated: updated.length, ids: updated });
}
