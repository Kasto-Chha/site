import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../lib/supabase/server";
import { LIMITS, lengthError } from "../../../lib/validate";
import { checkRateLimit, retryAfterSeconds } from "../../../lib/ratelimit";
import { BODY_LIMITS, readJsonBody } from "../../../lib/requestBody";
import { logDbError } from "../../../lib/dbError";

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit("write", userId);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "You're posting too fast. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.reset)) } }
    );
  }

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const payload = parsed.data;
  const question = (payload.question || "").toString().trim();
  const category = (payload.category || "").toString().trim();

  if (!question) {
    return NextResponse.json({ error: "Question is required." }, { status: 400 });
  }

  const lenError = lengthError({
    Question: { value: question, max: LIMITS.question },
    Category: { value: category, max: LIMITS.category }
  });
  if (lenError) {
    return NextResponse.json({ error: lenError }, { status: 400 });
  }

  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("questions")
      .insert({
        question,
        category: category || null,
        user_id: userId
      })
      .select()
      .single();

    if (error) {
      logDbError("POST /api/questions", error);
      return NextResponse.json({ error: "Failed to save question." }, { status: 500 });
    }

    return NextResponse.json({ question: data });
  } catch (error) {
    console.error("POST /api/questions failed:", error?.message || error);
    return NextResponse.json({ error: "Failed to save question." }, { status: 500 });
  }
}
