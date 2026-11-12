// Which businesses an operator may work on (patch 13). An operator sees and edits only the businesses assigned to them.
// Every read that decides access FAILS CLOSED: if the assignments cannot be read, the answer is "none", never "all".

const fail = (message, error) => Object.assign(new Error(message), { code: error?.code });

export async function assignedMerchantIds(supabase, userId) {
  if (!userId) return [];
  const { data, error } = await supabase.from("sync_operator_assignments").select("merchant_id").eq("operator_user_id", userId);
  if (error) throw fail("The assignments could not be read.", error);
  return (data || []).map((row) => row.merchant_id);
}

export async function isAssigned(supabase, userId, merchantId) {
  if (!userId || !merchantId) return false;
  try {
    return (await assignedMerchantIds(supabase, userId)).includes(merchantId);
  } catch {
    return false;
  }
}

export async function listAssignments(supabase) {
  const { data, error } = await supabase.from("sync_operator_assignments").select("operator_user_id, merchant_id, created_at").limit(5000);
  if (error) throw fail("The assignments could not be read.", error);
  return data || [];
}

export async function operatorsOfMerchant(supabase, merchantId) {
  const { data, error } = await supabase.from("sync_operator_assignments").select("operator_user_id").eq("merchant_id", merchantId);
  if (error) throw fail("The assignments could not be read.", error);
  return (data || []).map((row) => row.operator_user_id);
}

// Idempotent: assigning someone who is already assigned changes nothing and says so.
export async function assignOperator(supabase, { operatorId, merchantId, assignedBy }) {
  if (await isAssignedStrict(supabase, operatorId, merchantId)) return { created: false };
  const { error } = await supabase.from("sync_operator_assignments").insert({ operator_user_id: operatorId, merchant_id: merchantId, assigned_by: assignedBy || null });
  // Two admins pressing at once: the second is refused by the table's own rule, which is the same answer.
  if (error && error.code !== "23505") throw fail("The assignment could not be saved.", error);
  return { created: !error };
}

async function isAssignedStrict(supabase, operatorId, merchantId) {
  return (await assignedMerchantIds(supabase, operatorId)).includes(merchantId);
}

export async function unassignOperator(supabase, { operatorId, merchantId }) {
  const { error } = await supabase.from("sync_operator_assignments").delete().eq("operator_user_id", operatorId).eq("merchant_id", merchantId);
  if (error) throw fail("The assignment could not be removed.", error);
}

// The operators, for the Team page. The role itself lives in Clerk and is what grants access; this is only who to show.
export async function listOperators(supabase) {
  const { data, error } = await supabase.from("sync_operators").select("operator_user_id, added_by, created_at").order("created_at", { ascending: true }).limit(500);
  if (error) throw fail("The operators could not be read.", error);
  return data || [];
}

export async function recordOperator(supabase, { operatorId, addedBy }) {
  const { data, error } = await supabase.from("sync_operators").select("operator_user_id").eq("operator_user_id", operatorId).maybeSingle();
  if (error) throw fail("The operators could not be read.", error);
  if (data) return { created: false };
  const inserted = await supabase.from("sync_operators").insert({ operator_user_id: operatorId, added_by: addedBy || null });
  if (inserted.error && inserted.error.code !== "23505") throw fail("The operator could not be saved.", inserted.error);
  return { created: !inserted.error };
}

// When someone stops being an operator: they leave the list, their assignments go, and their tasks become nobody's, not deleted.
export async function removeOperatorData(supabase, operatorId) {
  const forgotten = await supabase.from("sync_operators").delete().eq("operator_user_id", operatorId);
  if (forgotten.error) throw fail("The operator could not be removed.", forgotten.error);
  const removedAssignments = await supabase.from("sync_operator_assignments").delete().eq("operator_user_id", operatorId);
  if (removedAssignments.error) throw fail("The assignments could not be removed.", removedAssignments.error);
  const freed = await supabase.from("sync_tasks").update({ assignee_user_id: null, updated_at: new Date().toISOString() }).eq("assignee_user_id", operatorId);
  if (freed.error) throw fail("Their tasks could not be released.", freed.error);
}

// Whether this account is the linked owner of any business. An owner cannot also be an operator: it would let someone
// edit the business they speak for. A failed read throws, so the caller refuses rather than guesses.
export async function isLinkedOwner(supabase, userId) {
  const { data, error } = await supabase.from("sync_merchants").select("id").eq("owner_user_id", userId).limit(1);
  if (error) throw fail("The owners could not be read.", error);
  return Boolean(data && data.length);
}
