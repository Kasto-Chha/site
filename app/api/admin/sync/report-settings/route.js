import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../lib/admin/audit";
import { logDbError } from "../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../lib/requestBody";
import { cleanSettings, readSettings, writeSettings } from "../../../../../lib/sync/reportSettings";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

// Save the report's price and numbers. Admin only. The audit log keeps which of the four were changed, never their values.
export async function PUT(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const { values, error } = cleanSettings(parsed.data);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const supabase = createServerSupabase();
  const before = await readSettings(supabase);
  const changed = ["price", "phone", "whatsapp", "booking_link"].filter((key) => (before?.[key] ?? null) !== values[key]);
  if (changed.length === 0) return NextResponse.json({ ok: true, unchanged: true });

  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: "sync.report_settings.update",
      targetType: "sync_report_settings",
      targetId: "default",
      before: null,
      after: { changed }
    });
  } catch (auditError) {
    console.error("sync report settings:", auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }
  try {
    await writeSettings(supabase, values, authResult.userId);
  } catch (writeError) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError("sync report settings", writeError);
    return NextResponse.json({ error: "Could not save the settings. Has migration 0029 been run?" }, { status: 500 });
  }
  await closeAuditEntry(supabase, auditId, { applied: true });
  return NextResponse.json({ ok: true });
}
