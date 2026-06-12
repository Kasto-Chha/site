import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../../lib/supabase/server";

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const id = (payload.id || "").toString();

  if (!id) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const supabase = createServerSupabase();
    const { data: current, error } = await supabase
      .from("experiences")
      .select("love_count")
      .eq("id", id)
      .single();

    if (error || !current) {
      return NextResponse.json({ error: "Experience not found." }, { status: 404 });
    }

    const nextLove = (current.love_count || 0) + 1;
    const { data: updated, error: updateError } = await supabase
      .from("experiences")
      .update({ love_count: nextLove })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ experience: updated });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update love." }, { status: 500 });
  }
}
