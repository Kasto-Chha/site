import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../../../lib/supabase/server";
import { getUserRole, hasRole, ROLE } from "../../../../../lib/auth/roles";
import { LIMITS, lengthError } from "../../../../../lib/validate";
import { checkRateLimit, retryAfterSeconds } from "../../../../../lib/ratelimit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ownership is decided here, on the server, from the row's author_user_id —
// never from anything the client sends. Admins may also remove a comment
// (moderation), but only the author may rewrite one.
async function loadComment(supabase, id) {
  const { data, error } = await supabase
    .from("blog_comments")
    .select("id, author_user_id, post_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error };
  return { comment: data || null };
}

// Shared preamble for both verbs: auth, rate limit, and load the target row.
// Returns either { response } to short-circuit, or the loaded context.
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
  const { comment, error } = await loadComment(supabase, id);
  if (error) {
    console.error("blog_comments read failed:", error.message);
    return {
      response: NextResponse.json({ error: "Something went wrong." }, { status: 500 })
    };
  }
  if (!comment) {
    return {
      response: NextResponse.json({ error: "Comment not found." }, { status: 404 })
    };
  }

  return { userId, supabase, comment };
}

export async function PATCH(request, { params }) {
  const gate = await guard(params.id);
  if (gate.response) return gate.response;
  const { userId, supabase, comment } = gate;

  if (comment.author_user_id !== userId) {
    return NextResponse.json(
      { error: "You can only edit your own comment." },
      { status: 403 }
    );
  }

  const payload = await request.json().catch(() => ({}));
  const body = (payload.body || "").toString().trim();

  if (!body) {
    return NextResponse.json({ error: "Comment cannot be empty." }, { status: 400 });
  }

  const lenError = lengthError({ Comment: { value: body, max: LIMITS.comment } });
  if (lenError) {
    return NextResponse.json({ error: lenError }, { status: 400 });
  }

  const save = (patch) =>
    supabase
      .from("blog_comments")
      .update(patch)
      .eq("id", comment.id)
      .eq("author_user_id", userId)
      .select()
      .single();

  let { data, error } = await save({
    body,
    updated_at: new Date().toISOString()
  });

  // blog_comments.updated_at ships in migration 0003. Until that is applied,
  // save the edit without the timestamp rather than failing the whole request.
  if (error && /updated_at/i.test(error.message || "")) {
    ({ data, error } = await save({ body }));
  }

  if (error) {
    console.error("blog_comments update failed:", error.message);
    return NextResponse.json({ error: "Could not save your edit." }, { status: 500 });
  }

  // Match the page: commenter ids stay on the server.
  const { author_user_id: _omit, ...safe } = data || {};
  return NextResponse.json({ comment: safe });
}

export async function DELETE(request, { params }) {
  const gate = await guard(params.id);
  if (gate.response) return gate.response;
  const { userId, supabase, comment } = gate;

  const isAuthor = comment.author_user_id === userId;
  if (!isAuthor) {
    const role = await getUserRole(userId);
    if (!hasRole(role, ROLE.ADMIN)) {
      return NextResponse.json(
        { error: "You can only delete your own comment." },
        { status: 403 }
      );
    }
  }

  const query = supabase.from("blog_comments").delete().eq("id", comment.id);
  // Authors are additionally scoped by author_user_id so a race can't delete
  // someone else's row; admins delete by id.
  const { error } = isAuthor ? await query.eq("author_user_id", userId) : await query;

  if (error) {
    console.error("blog_comments delete failed:", error.message);
    return NextResponse.json({ error: "Could not delete the comment." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: comment.id });
}
