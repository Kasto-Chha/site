import { auth } from "@clerk/nextjs/server";
import { getClerkUser } from "./clerk";

// OPERATOR works the businesses an admin assigns to them (patch 13). It ranks between user and admin, so every page and route
// that requires ADMIN stays closed to operators with no edit: only code that asks for OPERATOR lets one in.
export const ROLE = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  OPERATOR: "operator",
  USER: "user"
};

const ROLE_RANK = {
  [ROLE.SUPER_ADMIN]: 4,
  [ROLE.ADMIN]: 3,
  [ROLE.OPERATOR]: 2,
  [ROLE.USER]: 1
};

export function normalizeRole(value) {
  const role = (value || ROLE.USER).toString();
  if (role === ROLE.SUPER_ADMIN) return ROLE.SUPER_ADMIN;
  if (role === ROLE.ADMIN) return ROLE.ADMIN;
  if (role === ROLE.OPERATOR) return ROLE.OPERATOR;
  return ROLE.USER;
}

export function hasRole(role, required) {
  return (ROLE_RANK[normalizeRole(role)] || 0) >= (ROLE_RANK[normalizeRole(required)] || 0);
}

export async function getUserRole(userId) {
  if (!userId) return ROLE.USER;
  try {
    const user = await getClerkUser(userId);
    return normalizeRole(user?.publicMetadata?.role);
  } catch {
    return ROLE.USER;
  }
}

export async function requireRole(required) {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, status: 401, role: ROLE.USER };
  }

  const role = await getUserRole(userId);
  if (!hasRole(role, required)) {
    return { ok: false, status: 403, role };
  }

  return { ok: true, status: 200, role, userId };
}
