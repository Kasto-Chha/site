import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../../lib/supabase/server";
import { getClerkUser, getPreferredUserName } from "../../../../lib/auth/clerk";
import { LIMITS, lengthError } from "../../../../lib/validate";
import { checkRateLimit, retryAfterSeconds } from "../../../../lib/ratelimit";

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit("write", userId);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "You're commenting too fast. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.reset)) } }
    );
  }

  const payload = await request.json().catch(() => ({}));
  const postId = (payload.postId || "").toString();
  const body = (payload.body || "").toString().trim();

  if (!postId || !body) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const lenError = lengthError({ Comment: { value: body, max: LIMITS.comment } });
  if (lenError) {
    return NextResponse.json({ error: lenError }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const user = await getClerkUser(userId);
  const authorName = getPreferredUserName(user);

  const { data, error } = await supabase
    .from("blog_comments")
    .insert({
      post_id: postId,
      author_user_id: userId,
      author_name: authorName,
      body
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The page strips commenter ids before they reach the browser; do the same
  // here so the freshly posted comment matches the shape of the rest.
  const { author_user_id: _omit, ...safe } = data || {};
  return NextResponse.json({ comment: safe });
}
