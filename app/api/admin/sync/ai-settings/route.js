import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../lib/admin/audit";
import { logDbError } from "../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../lib/requestBody";
import { saveAiSettings } from "../../../../../lib/sync/aiReply";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

// Turn AI drafts of review replies on or off: { repliesEnabled: true | false }. Admin only, and recorded.
export async function PUT(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const wanted = parsed.data && typeof parsed.data === "object" ? parsed.data.repliesEnabled : undefined;
  if (typeof wanted !== "boolean") return NextResponse.json({ error: "Choose on or off." }, { status: 400 });

  const supabase = createServerSupabase();
  let auditId;
  try {
    auditId = await openAuditEntry(supabase, { actorId: authResult.userId, action: "sync.ai.replies", targetType: "sync_setting", targetId: "ai", before: null, after: { enabled: wanted } });
  } catch (auditError) {
    console.error("sync.ai.replies:", auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }
  try {
    await saveAiSettings(supabase, wanted, authResult.userId, new Date().toISOString());
    await closeAuditEntry(supabase, auditId, { applied: true });
    return NextResponse.json({ ok: true, enabled: wanted });
  } catch (error) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError("sync.ai.replies", error);
    return NextResponse.json({ error: "Could not save. Has migration 0038 been run?" }, { status: 500 });
  }
}
