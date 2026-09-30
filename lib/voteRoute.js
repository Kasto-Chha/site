import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "./supabase/server";
import { castVote } from "./votes";
import { checkRateLimit, retryAfterSeconds } from "./ratelimit";
import { BODY_LIMITS, readJsonBody } from "./requestBody";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// All three vote endpoints (trending polls, battles, review up/down) do the
// same thing against different tables: move the caller's one ledger row and
// the target's counters by exactly that transition — atomically, in cast_vote.
// The response always carries the fresh row plus the caller's resulting vote
// ("vote": null when they withdrew it), so the client never has to guess what
// the number became.
//
//   targetType — value stored in user_votes.target_type
//   choices    — the valid options (cast_vote checks the same list)
//   field      — payload key carrying the choice ("side" or "direction")
//   resultKey  — key the updated row is returned under
export function createVoteHandler({ targetType, choices, field, resultKey, missingLabel }) {
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

    const parsed = await readJsonBody(request, BODY_LIMITS.small);
    if (parsed.response) return parsed.response;
    const payload = parsed.data;
    const id = (payload.id || "").toString();
    const choice = choices.includes(payload[field]) ? payload[field] : "";

    if (!UUID_RE.test(id) || !choice) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    try {
      const supabase = createServerSupabase();
      const result = await castVote(supabase, {
        userId,
        targetType,
        targetId: id,
        value: choice
      });

      if (result.error) {
        console.error(`${targetType} vote failed:`, result.error.message);
        return NextResponse.json(
          { error: "Could not record your vote. Please try again." },
          { status: 500 }
        );
      }
      if (!result.found) {
        return NextResponse.json({ error: `${missingLabel} not found.` }, { status: 404 });
      }

      return NextResponse.json({ [resultKey]: result.row, vote: result.vote });
    } catch (error) {
      console.error(`POST /api/votes/${targetType} failed:`, error?.message || error);
      return NextResponse.json({ error: "Failed to record your vote." }, { status: 500 });
    }
  };
}
