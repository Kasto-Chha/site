// Audit trail for admin actions (supabase/migrations/0015_admin_audit_log.sql).
//
// Write-ahead: openAuditEntry records the action before it happens and throws
// if it cannot, so callers refuse the change instead of making it unrecorded.
// Without that, a missing table or a failed insert would leave admins editing
// with no trail and nobody noticing — exactly the silent gap an audit log is
// meant to rule out. closeAuditEntry then marks how it ended.
//
// The service-role key can still rewrite this table, like any other. It
// records what went through the app; it is not tamper-proof against someone
// holding that key.

// Returns the entry id. Throws if the entry could not be written.
export async function openAuditEntry(
  supabase,
  { actorId, action, targetType, targetId, before = null, after = null }
) {
  if (!actorId) throw new Error("audit: an actor is required");

  const { data, error } = await supabase
    .from("admin_audit_log")
    .insert({
      actor_id: actorId,
      action,
      target_type: targetType,
      target_id: String(targetId),
      before,
      after
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`audit log write failed: ${error?.message || "no id returned"}`);
  }
  return data.id;
}

// Best-effort: the change has already happened (or failed) by now, and a
// response saying otherwise would be wrong either way. A failure here leaves
// the entry at 'pending' with the attempted values, and is logged.
export async function closeAuditEntry(supabase, id, { applied, after }) {
  const patch = { status: applied ? "applied" : "failed", completed_at: new Date().toISOString() };
  if (after !== undefined) patch.after = after;

  try {
    const { error } = await supabase.from("admin_audit_log").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error(`audit entry ${id} could not be closed:`, error?.message || error);
  }
}
