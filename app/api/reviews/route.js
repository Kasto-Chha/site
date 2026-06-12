import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../lib/supabase/server";
import { getClerkUser, getPreferredUserName } from "../../../lib/auth/clerk";
import { topicSlug } from "../../../lib/slug";

// Detects the "column does not exist" error so we can keep working against a
// database that has not had the topic_slug migration applied yet.
function isMissingColumn(error) {
  const message = (error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST204" ||
    error?.code === "42703" ||
    message.includes("topic_slug")
  );
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const title = (payload.title || "").toString().trim();
  const summary = (payload.summary || "").toString().trim();
  let category = (payload.category || "").toString().trim();
  const verdict = (payload.verdict || "").toString().trim();

  if (!title || !summary || !category) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const slug = topicSlug(title);

  try {
    const user = await getClerkUser(userId);
    const name = getPreferredUserName(user);

    const supabase = createServerSupabase();

    // If this topic already exists, adopt its canonical title + category so the
    // new experience folds into the same thread instead of creating a near
    // duplicate ("iPhone 15" vs "iphone 15").
    let canonicalTitle = title;
    if (slug) {
      const { data: existing } = await supabase
        .from("reviews")
        .select("title, topic, category")
        .eq("topic_slug", slug)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existing) {
        canonicalTitle = existing.topic || existing.title || title;
        if (existing.category) category = existing.category;
      }
    }

    const baseRow = {
      title: canonicalTitle,
      summary,
      topic: canonicalTitle,
      category,
      verdict: verdict || null,
      author_name: name,
      user_id: userId
    };

    let { data, error } = await supabase
      .from("reviews")
      .insert({ ...baseRow, topic_slug: slug })
      .select()
      .single();

    // Fall back gracefully if the topic_slug column has not been added yet.
    if (error && isMissingColumn(error)) {
      ({ data, error } = await supabase
        .from("reviews")
        .insert(baseRow)
        .select()
        .single());
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Ensure the client always receives a slug to group on, even on old DBs.
    const review = data?.topic_slug ? data : { ...data, topic_slug: slug };
    return NextResponse.json({ review });
  } catch (error) {
    const message = error?.message || "Failed to save review.";
    console.error("POST /api/reviews failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
