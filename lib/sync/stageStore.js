// Reading and saving a business's stage (patch 14a). Kept apart from the columns the public pages read, so a public page can
// never fail because of a stage column: only the admin screens ask for these.

export const STAGE_COLUMNS = "id, stage, trial_started_on, trial_ends_on, stage_note, stage_changed_at, stage_changed_by";

// Many at once, for the list. A failure answers { failed: true } with no rows: the screen then says so, and nothing else breaks.
export async function readStages(supabase, ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return { rows: new Map(), failed: false };
  const { data, error } = await supabase.from("sync_merchants").select(STAGE_COLUMNS).in("id", list);
  if (error) return { rows: new Map(), failed: true };
  return { rows: new Map((data || []).map((row) => [row.id, row])), failed: false };
}

// One business. Throws on a database problem; null if there is no such business.
export async function readStage(supabase, id) {
  const { data, error } = await supabase.from("sync_merchants").select(STAGE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw Object.assign(new Error("The stage could not be read."), { code: error.code });
  return data || null;
}

// Save a move, but only if the business is still in the stage the move was worked out from. Two people pressing at once:
// the second finds the stage already changed and gets null, instead of overwriting the first.
export async function writeStage(supabase, id, expectedStage, values) {
  const { data, error } = await supabase.from("sync_merchants").update(values).eq("id", id).eq("stage", expectedStage).select(STAGE_COLUMNS);
  if (error) throw Object.assign(new Error("The stage could not be saved."), { code: error.code });
  return data && data.length ? data[0] : null;
}
