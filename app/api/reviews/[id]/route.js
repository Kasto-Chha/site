import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../../lib/supabase/server";
import { getUserRole, hasRole, ROLE } from "../../../../lib/auth/roles";
import { LIMITS, lengthError } from "../../../../lib/validate";
import { checkRateLimit, retryAfterSeconds } from "../../../../lib/ratelimit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Editing an experience only ever changes what the author wrote — the body and
// the verdict. Title/topic/category stay put so a post can't be yanked out of
// the thread it's grouped into, and the vote counts are never client-writable.
async function guard(id) {
  const { userId } = await auth();
  if (!userId) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!UUID_RE.test(id || "")) {
    return { response: NextResponse.json({ error: "Invalid request." }, { status: 400 }) };
  }

  const rl = await checkRateLimit("write", userId);
  if (!rl.ok) {
    return {
      response: NextResponse.json(
        { error: "You're doing that too fast. Please wait a moment." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.reset)) } }
      )
    };
  }

  const supabase = createServerSupabase();
  const { data: review, error } = await supabase
    .from("reviews")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("reviews read failed:", error.message);
    return {
      response: NextResponse.json({ error: "Something went wrong." }, { status: 500 })
    };
  }
  if (!review) {
    return {
      response: NextResponse.json({ error: "Experience not found." }, { status: 404 })
    };
  }

  return { userId, supabase, review };
}

export async function PATCH(request, { params }) {
  const gate = await guard(params.id);
  if (gate.response) return gate.response;
  const { userId, supabase, review } = gate;

  // Ownership is read from the stored row, never from the request body.
  if (review.user_id !== userId) {
    return NextResponse.json(
      { error: "You can only edit your own experience." },
      { status: 403 }
    );
  }

  const payload = await request.json().catch(() => ({}));
  const summary = (payload.summary || "").toString().trim();
  const verdict = (payload.verdict || "").toString().trim();

  if (!summary) {
    return NextResponse.json({ error: "Experience cannot be empty." }, { status: 400 });
  }

  const lenError = lengthError({
    Experience: { value: summary, max: LIMITS.summary },
    Verdict: { value: verdict, max: LIMITS.verdict }
  });
  if (lenError) {
    return NextResponse.json({ error: lenError }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("reviews")
    .update({ summary, verdict: verdict || null })
    .eq("id", review.id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("reviews update failed:", error.message);
    return NextResponse.json({ error: "Could not save your edit." }, { status: 500 });
  }

  return NextResponse.json({ review: data });
}

export async function DELETE(request, { params }) {
  const gate = await guard(params.id);
  if (gate.response) return gate.response;
  const { userId, supabase, review } = gate;

  const isAuthor = review.user_id === userId;
  if (!isAuthor) {
    const role = await getUserRole(userId);
    if (!hasRole(role, ROLE.ADMIN)) {
      return NextResponse.json(
        { error: "You can only delete your own experience." },
        { status: 403 }
      );
    }
  }

  const query = supabase.from("reviews").delete().eq("id", review.id);
  // Authors are additionally scoped by user_id so a race can't remove someone
  // else's row; admins delete by id for moderation.
  const { error } = isAuthor ? await query.eq("user_id", userId) : await query;

  if (error) {
    console.error("reviews delete failed:", error.message);
    return NextResponse.json({ error: "Could not delete the experience." }, { status: 500 });
  }

  // Drop the vote ledger rows too, so the id can't leave orphans behind.
  try {
    await supabase
      .from("user_votes")
      .delete()
      .eq("target_type", "review")
      .eq("target_id", review.id);
  } catch {
    // Best-effort cleanup; the experience is already gone.
  }

  return NextResponse.json({ ok: true, id: review.id });
}
