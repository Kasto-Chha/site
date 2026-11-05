import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../../lib/admin/audit";
import { adminSaveMessage, logDbError } from "../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../lib/requestBody";
import { FEEDBACK_STATUSES } from "../../../../../../lib/sync/feedback";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

// What the audit log keeps of a note: which one, whose, and where it stands. Never its words or the contact
// left with it: the log is for who did what, and a private note must not be copied into it.
const trail = (row) => ({ id: row.id, merchant_id: row.merchant_id, status: row.status, is_urgent: row.is_urgent, handled_at: row.handled_at });

// Move a private note along: new, in the digest that was sent, or resolved. Admin only. Moving it back to
// "new" is allowed (a mistake, or a note that needs another look); resolving stamps the time.
export async function PUT(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  if (!UUID_RE.test(params.id || "")) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const status = parsed.data?.status;
  if (!FEEDBACK_STATUSES.includes(status)) return NextResponse.json({ error: "Choose a status: new, in_digest or resolved." }, { status: 400 });

  const supabase = createServerSupabase();
  const context = "admin sync update feedback";
  const found = await supabase.from("sync_feedback").select("*").eq("id", params.id).maybeSingle();
  if (found.error) {
    logDbError(context, found.error);
    return NextResponse.json({ error: "Could not load that note." }, { status: 500 });
  }
  if (!found.data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  // Already there: nothing to change and nothing to record (a double click, or two people at once).
  if (found.data.status === status) return NextResponse.json({ note: found.data });

  const values = { status, handled_at: status === "resolved" ? new Date().toISOString() : null };
  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: `sync.feedback.${status}`,
      targetType: "sync_feedback",
      targetId: params.id,
      before: trail(found.data),
      after: trail({ ...found.data, ...values })
    });
  } catch (auditError) {
    console.error(`${context}:`, auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }

  const { data, error } = await supabase.from("sync_feedback").update(values).eq("id", params.id).select().single();
  if (error) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError(context, error);
    return NextResponse.json({ error: adminSaveMessage(error) }, { status: 500 });
  }
  await closeAuditEntry(supabase, auditId, { applied: true, after: trail(data) });
  return NextResponse.json({ note: data });
}
