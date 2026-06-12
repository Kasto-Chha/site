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
  const side = payload.side === "a" ? "a" : payload.side === "b" ? "b" : "";

  if (!id || !side) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const supabase = createServerSupabase();
    const { data: current, error } = await supabase
      .from("battles")
      .select("left_votes, right_votes")
      .eq("id", id)
      .single();

    if (error || !current) {
      return NextResponse.json({ error: "Battle not found." }, { status: 404 });
    }

    const nextLeft = (current.left_votes || 0) + (side === "a" ? 1 : 0);
    const nextRight = (current.right_votes || 0) + (side === "b" ? 1 : 0);

    const { data: updated, error: updateError } = await supabase
      .from("battles")
      .update({ left_votes: nextLeft, right_votes: nextRight })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ battle: updated });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update vote." }, { status: 500 });
  }
}
