import { NextResponse } from "next/server";

import { getClerkClient } from "../../../../lib/auth/clerk";
import { requireRole, ROLE, hasRole, normalizeRole } from "../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../lib/admin/audit";
import { createServerSupabase } from "../../../../lib/supabase/server";
import { BODY_LIMITS, readJsonBody } from "../../../../lib/requestBody";

const ROLES = [ROLE.USER, ROLE.ADMIN, ROLE.SUPER_ADMIN];

export async function POST(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  }
  const actorIsSuper = hasRole(authResult.role, ROLE.SUPER_ADMIN);

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const payload = parsed.data;
  let targetUserId = (payload.userId || "").toString().trim();
  const email = (payload.email || "").toString().trim();
  const nextRole = (payload.role || "").toString();

  if ((!targetUserId && !email) || !nextRole) {
    return NextResponse.json({ error: "User and role are required." }, { status: 400 });
  }
  if (!ROLES.includes(nextRole)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  if (nextRole === ROLE.SUPER_ADMIN && !actorIsSuper) {
    return NextResponse.json({ error: "Only super admins can assign super admin." }, { status: 403 });
  }

  try {
    const clerk = await getClerkClient();

    if (!targetUserId) {
      const userList = await clerk.users.getUserList({ emailAddress: [email] });
      const found = userList?.data?.[0];
      if (!found) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }
      targetUserId = found.id;
    }

    const target = await clerk.users.getUser(targetUserId);
    const currentRole = normalizeRole(target?.publicMetadata?.role);

    // Only a super admin may change a super admin's role. Without this, the
    // check above stopped an admin from creating a super admin but not from
    // demoting one.
    if (currentRole === ROLE.SUPER_ADMIN && !actorIsSuper) {
      return NextResponse.json(
        { error: "Only super admins can change a super admin's role." },
        { status: 403 }
      );
    }

    if (currentRole === nextRole) {
      return NextResponse.json({ ok: true, userId: targetUserId, role: nextRole, unchanged: true });
    }

    const supabase = createServerSupabase();
    let auditId;
    try {
      auditId = await openAuditEntry(supabase, {
        actorId: authResult.userId,
        action: "role.change",
        targetType: "user",
        targetId: targetUserId,
        before: { role: currentRole },
        after: { role: nextRole }
      });
    } catch (auditError) {
      console.error("admin role change:", auditError.message);
      return NextResponse.json(
        { error: "Could not record this change in the audit log, so the role was not changed." },
        { status: 500 }
      );
    }

    try {
      // updateUserMetadata merges. updateUser({ publicMetadata }) — what this
      // used — replaces the whole object, and publicMetadata also holds the
      // user's terms acceptance, so every role change sent them back through
      // the consent gate.
      await clerk.users.updateUserMetadata(targetUserId, {
        publicMetadata: { role: nextRole }
      });
    } catch (updateError) {
      await closeAuditEntry(supabase, auditId, { applied: false });
      throw updateError;
    }
    await closeAuditEntry(supabase, auditId, { applied: true });

    return NextResponse.json({ ok: true, userId: targetUserId, role: nextRole });
  } catch (error) {
    if (error?.status === 404) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    console.error("admin role change failed:", error?.message || error);
    return NextResponse.json({ error: "Could not update the role. Please try again." }, { status: 500 });
  }
}
