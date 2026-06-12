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
  const side = payload.side === "yes" ? "yes" : payload.side === "no" ? "no" : "";

  if (!id || !side) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const supabase = createServerSupabase();
    const { data: current, error } = await supabase
      .from("trending_topics")
      .select("votes_yes, votes_no")
      .eq("id", id)
      .single();

    if (error || !current) {
      return NextResponse.json({ error: "Topic not found." }, { status: 404 });
    }

    const nextYes = (current.votes_yes || 0) + (side === "yes" ? 1 : 0);
    const nextNo = (current.votes_no || 0) + (side === "no" ? 1 : 0);

    const { data: updated, error: updateError } = await supabase
      .from("trending_topics")
      .update({ votes_yes: nextYes, votes_no: nextNo })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ topic: updated });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update vote." }, { status: 500 });
  }
}
