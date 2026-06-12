import { NextResponse } from "next/server";

import { getClerkClient } from "../../../../lib/auth/clerk";
import { requireRole, ROLE, hasRole } from "../../../../lib/auth/roles";

export async function POST(request) {
  const clerk = await getClerkClient();
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  }

  const payload = await request.json().catch(() => ({}));
  let targetUserId = (payload.userId || "").toString().trim();
  const email = (payload.email || "").toString().trim();
  const nextRole = (payload.role || "").toString();

  if (!targetUserId && email) {
    const userList = await clerk.users.getUserList({ emailAddress: [email] });
    const found = userList?.data?.[0];
    if (!found) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    targetUserId = found.id;
  }

  if (!targetUserId || !nextRole) {
    return NextResponse.json({ error: "User and role are required." }, { status: 400 });
  }

  if (nextRole === ROLE.SUPER_ADMIN && !hasRole(authResult.role, ROLE.SUPER_ADMIN)) {
    return NextResponse.json({ error: "Only super admins can assign super admin." }, { status: 403 });
  }

  if (![ROLE.USER, ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(nextRole)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  await clerk.users.updateUser(targetUserId, {
    publicMetadata: { role: nextRole }
  });

  return NextResponse.json({ ok: true, userId: targetUserId, role: nextRole });
}
