import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../lib/supabase/server";

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const question = (payload.question || "").toString().trim();
  const category = (payload.category || "").toString().trim();

  if (!question) {
    return NextResponse.json({ error: "Question is required." }, { status: 400 });
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ question: data });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save question." }, { status: 500 });
  }
}
