import { hasRole, requireRole, ROLE } from "../auth/roles";

// Who may use the dashboard's pages and routes. Almost everything under /admin/sync is for admins only. A few pieces
// are also open to an operator (patch 13), and each of those asks here. `isAdmin` says which of the two it is; an
// operator is then limited to the businesses assigned to them (lib/sync/team.js).
export async function syncAccess() {
  const result = await requireRole(ROLE.OPERATOR);
  if (!result.ok) return result;
  return { ...result, isAdmin: hasRole(result.role, ROLE.ADMIN) };
}
