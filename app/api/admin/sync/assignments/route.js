import { NextResponse } from "next/server";

import { getUserRole, requireRole, ROLE } from "../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../lib/admin/audit";
import { BODY_LIMITS, readJsonBody } from "../../../../../lib/requestBody";
import { createServerSupabase } from "../../../../../lib/supabase/server";
import { assignOperator, unassignOperator } from "../../../../../lib/sync/team";
import { isAccountId, isUuid } from "../../../../../lib/sync/tasks";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

async function readPair(request) {
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return { response: parsed.response };
  const operatorId = typeof parsed.data?.operatorId === "string" ? parsed.data.operatorId.trim() : "";
  const merchantId = typeof parsed.data?.merchantId === "string" ? parsed.data.merchantId : "";
  if (!isAccountId(operatorId) || !isUuid(merchantId)) return { response: NextResponse.json({ error: "Choose an operator and a business." }, { status: 400 }) };
  return { operatorId, merchantId };
}

// Give an operator a business to work on. Admins only. The account must be an operator, and the business must exist.
export async function PUT(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  const pair = await readPair(request);
  if (pair.response) return pair.response;

  const supabase = createServerSupabase();
  try {
    if ((await getUserRole(pair.operatorId)) !== ROLE.OPERATOR) return NextResponse.json({ error: "That account is not an operator." }, { status: 400 });
    const found = await supabase.from("sync_merchants").select("id").eq("id", pair.merchantId).maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) return NextResponse.json({ error: "Business not found." }, { status: 404 });

    let auditId;
    try {
      auditId = await openAuditEntry(supabase, { actorId: authResult.userId, action: "sync.assignment.add", targetType: "sync_merchant", targetId: pair.merchantId, before: null, after: { operator: pair.operatorId } });
    } catch (auditError) {
      console.error("sync assignment add:", auditError.message);
      return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
    }
    let result;
    try {
      result = await assignOperator(supabase, { operatorId: pair.operatorId, merchantId: pair.merchantId, assignedBy: authResult.userId });
    } catch (failure) {
      await closeAuditEntry(supabase, auditId, { applied: false });
      throw failure;
    }
    await closeAuditEntry(supabase, auditId, { applied: true });
    return NextResponse.json({ ok: true, created: result.created });
  } catch (error) {
    console.error("sync assignment add failed:", error?.message || error);
    return NextResponse.json({ error: "Could not save the assignment." }, { status: 500 });
  }
}

// Take a business off an operator. Their tasks for it stay where they are, so nothing is lost.
export async function DELETE(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  const pair = await readPair(request);
  if (pair.response) return pair.response;

  const supabase = createServerSupabase();
  try {
    let auditId;
    try {
      auditId = await openAuditEntry(supabase, { actorId: authResult.userId, action: "sync.assignment.remove", targetType: "sync_merchant", targetId: pair.merchantId, before: { operator: pair.operatorId }, after: null });
    } catch (auditError) {
      console.error("sync assignment remove:", auditError.message);
      return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
    }
    try {
      await unassignOperator(supabase, pair);
    } catch (failure) {
      await closeAuditEntry(supabase, auditId, { applied: false });
      throw failure;
    }
    await closeAuditEntry(supabase, auditId, { applied: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("sync assignment remove failed:", error?.message || error);
    return NextResponse.json({ error: "Could not remove the assignment." }, { status: 500 });
  }
}
