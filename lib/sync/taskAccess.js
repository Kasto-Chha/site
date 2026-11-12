import { getUserRole, hasRole, ROLE } from "../auth/roles";
import { assignedMerchantIds, operatorsOfMerchant } from "./team";

// The businesses a person may see tasks for: null means all of them (an admin), or the list assigned to an operator. Reading
// the list can fail, and then it throws: an operator whose assignments cannot be read gets an error, never "all".
export async function scopeFor(supabase, access) {
  return access.isAdmin ? null : assignedMerchantIds(supabase, access.userId);
}

export const canSee = (scope, merchantId) => scope === null || scope.includes(merchantId);

// May `access` give a task for `merchantId` to `assignee`? Nobody (null) is always fine. An operator may only take a task
// themselves. An admin may give it to themselves, to an operator assigned to that business, or to another admin.
export async function assigneeAllowed(supabase, access, assignee, merchantId) {
  if (assignee === null || assignee === undefined) return true;
  if (assignee === access.userId) return true;
  if (!access.isAdmin) return false;
  if ((await operatorsOfMerchant(supabase, merchantId)).includes(assignee)) return true;
  return hasRole(await getUserRole(assignee), ROLE.ADMIN);
}
