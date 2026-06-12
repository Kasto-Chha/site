import { auth } from "@clerk/nextjs/server";
import { getClerkUser } from "./clerk";

export const ROLE = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  USER: "user"
};

const ROLE_RANK = {
  [ROLE.SUPER_ADMIN]: 3,
  [ROLE.ADMIN]: 2,
  [ROLE.USER]: 1
};

export function normalizeRole(value) {
  const role = (value || ROLE.USER).toString();
  if (role === ROLE.SUPER_ADMIN) return ROLE.SUPER_ADMIN;
  if (role === ROLE.ADMIN) return ROLE.ADMIN;
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
