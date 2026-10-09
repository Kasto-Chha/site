// Casting a vote: one call to cast_vote (supabase/migrations/0014), which moves
// the caller's user_votes row and the target's counters in a single
// transaction.
//
// user_votes holds at most one row per (user, target). A user may CHANGE their
// vote (yes -> no) or withdraw it (the same option again); both are edits to
// that one row, and the counters move by exactly that transition.
//
// This used to be three PostgREST calls from here — read the ledger, write it,
// then move the counters — plus a best-effort rollback when the last one
// failed. Two tabs or a replayed request could both read the same previous
// vote and both apply it, and the counters drifted from the ledger. The whole
// transition now happens inside Postgres under a lock on the target row.
//
// There is deliberately no JavaScript fallback for when the function is
// missing: any fallback would be the non-atomic version this replaces.

// Returns { found, vote, row } on success, or { error }.
//   found — false when the target does not exist (nothing was written)
//   vote  — the caller's choice afterwards, null if they withdrew it
//   row   — the target with its updated counters
export async function castVote(supabase, { userId, targetType, targetId, value }) {
  const { data, error } = await supabase.rpc("cast_vote", {
    p_user_id: userId,
    p_target_type: targetType,
    p_target_id: targetId,
    p_value: value
  });

  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      console.error("cast_vote is missing: apply supabase/migrations/0014_atomic_votes.sql");
    }
    return { error };
  }

  return {
    found: Boolean(data?.found),
    vote: data?.vote ?? null,
    row: data?.row ?? null
  };
}
