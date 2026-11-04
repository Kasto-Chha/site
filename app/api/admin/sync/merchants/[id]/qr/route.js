import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../../../lib/admin/audit";
import { logDbError } from "../../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../../lib/requestBody";
import { LABEL_MAX, MAX_CODES_PER_BUSINESS, cleanLabel, createQrCode } from "../../../../../../../lib/sync/qr";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

// A new QR code for a business: one per table, the counter, the window. Admin only. The code is
// made here, at random, and is never chosen by the browser.
export async function POST(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  if (!UUID_RE.test(params.id || "")) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const label = cleanLabel(parsed.data?.label) || "Table";
  if (label.length > LABEL_MAX) return NextResponse.json({ error: `The label can be at most ${LABEL_MAX} characters.` }, { status: 400 });

  const supabase = createServerSupabase();
  const context = "admin sync create qr";

  const merchant = await supabase.from("sync_merchants").select("id, status").eq("id", params.id).maybeSingle();
  if (merchant.error) {
    logDbError(context, merchant.error);
    return NextResponse.json({ error: "Could not load that business." }, { status: 500 });
  }
  if (!merchant.data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (merchant.data.status !== "active") {
    return NextResponse.json({ error: "A business whose tag was removed cannot get new QR codes. Restore the tag first." }, { status: 409 });
  }

  const existing = await supabase.from("sync_qr_codes").select("id").eq("merchant_id", params.id).limit(MAX_CODES_PER_BUSINESS + 1);
  if (existing.error) {
    logDbError(context, existing.error);
    return NextResponse.json({ error: "Could not check the existing codes." }, { status: 500 });
  }
  if ((existing.data || []).length >= MAX_CODES_PER_BUSINESS) {
    return NextResponse.json({ error: `A business can have at most ${MAX_CODES_PER_BUSINESS} QR codes.` }, { status: 409 });
  }

  const id = crypto.randomUUID();
  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: "sync.qr.create",
      targetType: "sync_qr_code",
      targetId: id,
      before: null,
      after: { id, merchant_id: params.id, label, active: true }
    });
  } catch (auditError) {
    console.error(`${context}:`, auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }

  try {
    const qr = await createQrCode(supabase, { merchantId: params.id, label, id });
    await closeAuditEntry(supabase, auditId, { applied: true, after: qr });
    return NextResponse.json({ qr: { ...qr, scans: 0, scans7: 0 } }, { status: 201 });
  } catch (error) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError(context, error);
    return NextResponse.json({ error: "Could not create the QR code. Try again." }, { status: 500 });
  }
}
