import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../lib/supabase/server";
import { getClerkUser, getPreferredUserName } from "../../../lib/auth/clerk";

function initialsFromName(name) {
  if (!name) return "AN";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "AN";
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const topic = (payload.topic || "").toString().trim();
  const verdict = (payload.verdict || "").toString().trim();
  const body = (payload.body || "").toString().trim();
  const categories = Array.isArray(payload.categories) ? payload.categories : [];

  if (!topic || !verdict || !body) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  try {
    let name = "Anonymous";
    try {
      const user = await getClerkUser(userId);
      name = getPreferredUserName(user);
    } catch {
      // Do not block writes when Clerk profile lookup fails temporarily.
      name = "Anonymous";
    }

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("experiences")
      .insert({
        topic,
        verdict,
        categories,
        body,
        author_name: name,
        author_initials: initialsFromName(name),
        user_id: userId
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ experience: data });
  } catch (error) {
    const message = error?.message || "Failed to save experience.";
    console.error("POST /api/experiences failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
