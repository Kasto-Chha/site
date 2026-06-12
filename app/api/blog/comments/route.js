import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../../lib/supabase/server";
import { getClerkUser, getPreferredUserName } from "../../../../lib/auth/clerk";

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const postId = (payload.postId || "").toString();
  const body = (payload.body || "").toString().trim();

  if (!postId || !body) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
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

  return NextResponse.json({ comment: data });
}
