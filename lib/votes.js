// Per-user vote ledger + the counter arithmetic that follows from it.
//
// user_votes holds at most one row per (user, target) — that unique constraint
// is what stops a user stuffing a counter. A user may still CHANGE their vote
// (yes -> no) or withdraw it (click the same option again); both are edits to
// that one row, not extra rows. Every counter move is derived from the ledger
// transition (previous -> next), so the displayed number always tracks it.

function isDuplicate(error) {
  return error?.code === "23505" || (error?.message || "").includes("duplicate key");
}

function isMissingTable(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    (error?.message || "").includes("user_votes")
  );
}

// The apply_* counter functions ship in migration 0003. Until that has been
// applied to the database, calling one fails with "function not found" and we
// fall back to a plain read-modify-write so voting keeps working.
function isMissingFunction(error, name) {
  const message = (error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST202" ||
    error?.code === "42883" ||
    message.includes(name.toLowerCase())
  );
}

// What this user currently has on this target, or null.
// Returns { value, unguarded } — unguarded means the ledger table is missing
// (migration not applied), so we can't know and voting proceeds without dedup.
export async function readVote(supabase, { userId, targetType, targetId }) {
  const { data, error } = await supabase
    .from("user_votes")
    .select("value")
    .eq("user_id", userId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return { value: null, unguarded: true };
    console.error("user_votes read failed:", error.message);
    return { value: null, error: true };
  }

  return { value: data?.value || null, unguarded: false };
}

// Move the ledger to `value` (pass "" / null to withdraw the vote).
// Returns { ok, previous, next } where previous/next are "" when there is no
// vote, so callers can hand them straight to the counter functions.
export async function setVote(supabase, { userId, targetType, targetId, value }) {
  const current = await readVote(supabase, { userId, targetType, targetId });

  // Unknown ledger failure: fail closed. We couldn't confirm this isn't a
  // replay, so don't touch the counters — better to ask the user to retry
  // than to let the numbers be stuffed.
  if (current.error) return { ok: false, error: true };

  const previous = current.value || "";
  // Clicking the option you already picked withdraws the vote.
  const next = value === previous ? "" : value || "";

  if (current.unguarded) {
    return { ok: true, unguarded: true, previous, next };
  }

  if (!next) {
    const { error } = await supabase
      .from("user_votes")
      .delete()
      .eq("user_id", userId)
      .eq("target_type", targetType)
      .eq("target_id", targetId);
    if (error) {
      console.error("user_votes delete failed:", error.message);
      return { ok: false, error: true };
    }
    return { ok: true, previous, next: "" };
  }

  if (previous) {
    const { error } = await supabase
      .from("user_votes")
      .update({ value: next })
      .eq("user_id", userId)
      .eq("target_type", targetType)
      .eq("target_id", targetId);
    if (error) {
      console.error("user_votes update failed:", error.message);
      return { ok: false, error: true };
    }
    return { ok: true, previous, next };
  }

  const { error } = await supabase.from("user_votes").insert({
    user_id: userId,
    target_type: targetType,
    target_id: targetId,
    value: next
  });

  if (!error) return { ok: true, previous: "", next };

  // Lost a race with the same user's concurrent click — the row now exists, so
  // re-run the transition against the value that actually landed.
  if (isDuplicate(error)) {
    return setVote(supabase, { userId, targetType, targetId, value });
  }
  if (isMissingTable(error)) {
    return { ok: true, unguarded: true, previous: "", next };
  }

  console.error("user_votes insert failed:", error.message);
  return { ok: false, error: true };
}

// Compensation for a transition whose counter update failed AFTER the ledger
// was moved: put the ledger back where it was, so the user isn't left with a
// recorded vote that never counted. Best-effort by design.
export async function restoreVote(supabase, { userId, targetType, targetId, previous }) {
  try {
    if (!previous) {
      await supabase
        .from("user_votes")
        .delete()
        .eq("user_id", userId)
        .eq("target_type", targetType)
        .eq("target_id", targetId);
      return;
    }
    await supabase.from("user_votes").upsert(
      {
        user_id: userId,
        target_type: targetType,
        target_id: targetId,
        value: previous
      },
      { onConflict: "user_id,target_type,target_id" }
    );
  } catch (error) {
    console.error("user_votes compensation failed:", error?.message || error);
  }
}

// Non-atomic fallback used only when the RPC is missing: read the counters and
// write them back with the delta applied. Susceptible to lost updates under
// heavy concurrency, but keeps voting working until migration 0003 is applied.
async function counterFallback(supabase, { table, id, previous, next, columns }) {
  const fields = Object.values(columns);
  const { data: current, error: readError } = await supabase
    .from(table)
    .select(fields.join(","))
    .eq("id", id)
    .maybeSingle();
  if (readError) return { row: null, error: readError };
  if (!current) return { row: null, error: null };

  const patch = {};
  const bump = (side, delta) => {
    const column = columns[side];
    if (!column) return;
    const base = patch[column] ?? current[column] ?? 0;
    patch[column] = Math.max(0, base + delta);
  };
  if (previous) bump(previous, -1);
  if (next) bump(next, 1);

  if (Object.keys(patch).length === 0) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return { row: data || null, error };
  }

  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  return { row: data || null, error };
}

// Apply a previous -> next vote transition to a target's counters.
// Returns { row, error }; row is null (with no error) when the target is gone.
export async function applyVoteCounters(
  supabase,
  { table, rpc, id, previous, next, columns }
) {
  const { data, error } = await supabase.rpc(rpc, {
    p_id: id,
    p_old: previous || "",
    p_new: next || ""
  });

  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    return { row: row || null, error: null };
  }

  if (!isMissingFunction(error, rpc)) return { row: null, error };

  return counterFallback(supabase, { table, id, previous, next, columns });
}
