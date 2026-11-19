import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../lib/admin/audit";
import { logDbError } from "../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../lib/requestBody";
import { cleanBillingSettings, saveBillingSettings } from "../../../../../lib/sync/billing";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

// The standard monthly price, how to pay, and the issuer line on receipts: { standardMonthly, instructions, issuer }. Admin only.
export async function PUT(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const cleaned = cleanBillingSettings(parsed.data);
  if (cleaned.error) return NextResponse.json({ error: cleaned.error }, { status: 400 });

  const supabase = createServerSupabase();
  let auditId;
  try {
    auditId = await openAuditEntry(supabase, { actorId: authResult.userId, action: "sync.billing.settings", targetType: "sync_setting", targetId: "billing", before: null, after: { priceSet: cleaned.values.standard_monthly !== null } });
  } catch (auditError) {
    console.error("sync.billing.settings:", auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }
  try {
    await saveBillingSettings(supabase, cleaned.values, authResult.userId, new Date().toISOString());
    await closeAuditEntry(supabase, auditId, { applied: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError("sync.billing.settings", error);
    return NextResponse.json({ error: "Could not save. Has migration 0039 been run?" }, { status: 500 });
  }
}
