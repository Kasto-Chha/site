import { NextResponse } from "next/server";

import { getClerkClient } from "../../../../../../lib/auth/clerk";
import { getUserRole, normalizeRole, requireRole, ROLE } from "../../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../../lib/admin/audit";
import { BODY_LIMITS, readJsonBody } from "../../../../../../lib/requestBody";
import { createServerSupabase } from "../../../../../../lib/supabase/server";
import { isLinkedOwner, recordOperator, removeOperatorData } from "../../../../../../lib/sync/team";
import { isAccountId } from "../../../../../../lib/sync/tasks";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

async function readTarget(request) {
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return { response: parsed.response };
  const userId = typeof parsed.data?.userId === "string" ? parsed.data.userId.trim() : "";
  if (!isAccountId(userId)) return { response: NextResponse.json({ error: "Choose an account." }, { status: 400 }) };
  return { userId };
}

// Make an account an operator. The person signs up on the site first; the admin finds them by email (the owner lookup
// does that) and confirms. An admin cannot be turned into an operator, and neither can a business's linked owner.
export async function POST(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  const target = await readTarget(request);
  if (target.response) return target.response;

  const supabase = createServerSupabase();
  try {
    const clerk = await getClerkClient();
    const user = await clerk.users.getUser(target.userId);
    const current = normalizeRole(user?.publicMetadata?.role);
    if (current === ROLE.OPERATOR) {
      // Already an operator in Clerk: make sure they are on the Team page too, and change nothing else.
      await recordOperator(supabase, { operatorId: target.userId, addedBy: authResult.userId });
      return NextResponse.json({ ok: true, userId: target.userId, unchanged: true });
    }
    if (current !== ROLE.USER) return NextResponse.json({ error: "That account is already an admin." }, { status: 400 });
    if (await isLinkedOwner(supabase, target.userId)) {
      return NextResponse.json({ error: "That account is the verified owner of a business, so it cannot also be an operator." }, { status: 400 });
    }

    let auditId;
    try {
      auditId = await openAuditEntry(supabase, { actorId: authResult.userId, action: "sync.operator.add", targetType: "user", targetId: target.userId, before: { role: current }, after: { role: ROLE.OPERATOR } });
    } catch (auditError) {
      console.error("sync operator add:", auditError.message);
      return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
    }
    try {
      // updateUserMetadata merges: the account's other metadata (its terms acceptance) stays.
      await clerk.users.updateUserMetadata(target.userId, { publicMetadata: { role: ROLE.OPERATOR } });
      await recordOperator(supabase, { operatorId: target.userId, addedBy: authResult.userId });
    } catch (updateError) {
      await closeAuditEntry(supabase, auditId, { applied: false });
      throw updateError;
    }
    await closeAuditEntry(supabase, auditId, { applied: true });
    return NextResponse.json({ ok: true, userId: target.userId });
  } catch (error) {
    if (error?.status === 404) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    console.error("sync operator add failed:", error?.message || error);
    return NextResponse.json({ error: "Could not make that account an operator. Please try again." }, { status: 500 });
  }
}

// Stop someone being an operator: their role goes back to an ordinary user, their assignments go, and their open tasks
// become nobody's. Run again, it finishes whatever a failed attempt left behind.
export async function DELETE(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  const target = await readTarget(request);
  if (target.response) return target.response;

  const supabase = createServerSupabase();
  try {
    const current = await getUserRole(target.userId);
    if (current !== ROLE.OPERATOR && current !== ROLE.USER) return NextResponse.json({ error: "That account is not an operator." }, { status: 400 });

    let auditId;
    try {
      auditId = await openAuditEntry(supabase, { actorId: authResult.userId, action: "sync.operator.remove", targetType: "user", targetId: target.userId, before: { role: current }, after: { role: ROLE.USER } });
    } catch (auditError) {
      console.error("sync operator remove:", auditError.message);
      return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
    }
    try {
      if (current === ROLE.OPERATOR) {
        const clerk = await getClerkClient();
        await clerk.users.updateUserMetadata(target.userId, { publicMetadata: { role: ROLE.USER } });
      }
      await removeOperatorData(supabase, target.userId);
    } catch (failure) {
      await closeAuditEntry(supabase, auditId, { applied: false });
      throw failure;
    }
    await closeAuditEntry(supabase, auditId, { applied: true });
    return NextResponse.json({ ok: true, userId: target.userId });
  } catch (error) {
    console.error("sync operator remove failed:", error?.message || error);
    return NextResponse.json({ error: "Could not remove that operator. Please try again." }, { status: 500 });
  }
}
