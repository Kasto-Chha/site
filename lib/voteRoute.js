import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "./supabase/server";
import { applyVoteCounters, restoreVote, setVote } from "./votes";
import { checkRateLimit, retryAfterSeconds } from "./ratelimit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// All three vote endpoints (trending polls, battles, review up/down) do the
// same thing against different tables: move the caller's one ledger row, then
// move the target's counters by exactly that transition. The response always
// carries the fresh row plus the caller's resulting vote ("vote": null when
// they withdrew it), so the client never has to guess what the number became.
//
//   targetType — value stored in user_votes.target_type
//   table/rpc  — target table and its apply_* counter function
//   columns    — { <choice>: <counter column> }, also the list of valid choices
//   field      — payload key carrying the choice ("side" or "direction")
//   resultKey  — key the updated row is returned under
export function createVoteHandler({
  targetType,
  table,
  rpc,
  columns,
  field,
  resultKey,
  missingLabel
}) {
  const choices = Object.keys(columns);

  return async function POST(request) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit("vote", userId);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many votes, please slow down." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.reset)) } }
      );
    }

    const payload = await request.json().catch(() => ({}));
    const id = (payload.id || "").toString();
    const choice = choices.includes(payload[field]) ? payload[field] : "";

    if (!UUID_RE.test(id) || !choice) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    try {
      const supabase = createServerSupabase();

      const vote = await setVote(supabase, {
        userId,
        targetType,
        targetId: id,
        value: choice
      });
      if (!vote.ok) {
        return NextResponse.json(
          { error: "Could not record your vote. Please try again." },
          { status: 500 }
        );
      }

      // Nothing moved (shouldn't happen, but keeps the response honest).
      if (vote.previous === vote.next) {
        const { data } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
        return NextResponse.json({ [resultKey]: data, vote: vote.next || null });
      }

      const { row, error } = await applyVoteCounters(supabase, {
        table,
        rpc,
        id,
        previous: vote.previous,
        next: vote.next,
        columns
      });

      if (error || !row) {
        // The counters never moved — put the ledger back so this user's vote
        // isn't left recorded against a number that never changed.
        if (!vote.unguarded) {
          await restoreVote(supabase, {
            userId,
            targetType,
            targetId: id,
            previous: vote.previous
          });
        }
        if (error) {
          console.error(`${targetType} vote update failed:`, error.message);
          return NextResponse.json(
            { error: "Could not record your vote. Please try again." },
            { status: 500 }
          );
        }
        return NextResponse.json({ error: `${missingLabel} not found.` }, { status: 404 });
      }

      return NextResponse.json({ [resultKey]: row, vote: vote.next || null });
    } catch (error) {
      console.error(`POST /api/votes/${targetType} failed:`, error?.message || error);
      return NextResponse.json({ error: "Failed to record your vote." }, { status: 500 });
    }
  };
}
