import { longDate } from "./stage";
import { nepalDay } from "./time";

// The moves a business has made between stages (patch 14c), read back from the audit log that already records each one.
// Only stages and dates are in the log, never the note's words, so that is all the history can show.

export const HISTORY_ACTIONS = ["sync.stage.make_active", "sync.stage.move_to_free", "sync.stage.start_trial", "sync.stage.change_end_date"];

// One line for one entry, or "" for something that is not a stage move.
export function describeMove(entry) {
  const after = entry?.after || {};
  switch (entry?.action) {
    case "sync.stage.make_active":
      return "Made Active";
    case "sync.stage.move_to_free":
      return "Moved to Free";
    case "sync.stage.start_trial":
      return after.trial_ends_on ? `Started a new trial, ending ${longDate(after.trial_ends_on)}` : "Started a new trial";
    case "sync.stage.change_end_date":
      return after.trial_ends_on ? `Changed the trial's end date to ${longDate(after.trial_ends_on)}` : "Changed the trial's end date";
    default:
      return "";
  }
}

// The newest first. A move that did not go through (status not applied) is not shown: it never happened.
export async function readStageHistory(supabase, merchantId, limit = 10) {
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("id, created_at, actor_id, action, after, status")
    .eq("target_type", "sync_merchant")
    .eq("target_id", merchantId)
    .eq("status", "applied")
    .in("action", HISTORY_ACTIONS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw Object.assign(new Error("The history could not be read."), { code: error.code });
  return (data || [])
    .map((row) => ({ id: row.id, when: longDate(nepalDay(new Date(row.created_at).getTime())), text: describeMove(row), actorId: row.actor_id }))
    .filter((row) => row.text);
}
