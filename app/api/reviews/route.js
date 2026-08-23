import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../lib/supabase/server";
import { getClerkUser, getPreferredUserName } from "../../../lib/auth/clerk";
import { topicSlug } from "../../../lib/slug";
import { LIMITS, lengthError } from "../../../lib/validate";
import { classifyReview } from "../../../lib/gemini";
import { checkRateLimit, retryAfterSeconds } from "../../../lib/ratelimit";
import { pingIndexNow } from "../../../lib/seo/indexnow";
import { isDiscussionIndexable } from "../../../lib/seo/indexable";

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

  const rl = await checkRateLimit("write", userId);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "You're posting too fast. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.reset)) } }
    );
  }

  const payload = await request.json().catch(() => ({}));
  const title = (payload.title || "").toString().trim();
  const summary = (payload.summary || "").toString().trim();
  let category = (payload.category || "").toString().trim();
  const verdict = (payload.verdict || "").toString().trim();

  // A question is a discussion with no answers yet — same table, same thread,
  // distinguished only by kind. Asking used to write to a separate `questions`
  // table, which meant a question and its answers could never be connected
  // except by comparing text, and that almost never matched.
  //
  // "title" is the subject ("Sikko Calculator") and "summary" is the question
  // ("Battery kati tikchha?"), exactly as for an experience. That is what keeps
  // a thread named after a subject rather than a whole sentence.
  const kind = payload.kind === "question" ? "question" : "experience";

  if (!title || !summary || !category) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const lenError = lengthError({
    Topic: { value: title, max: LIMITS.title },
    Category: { value: category, max: LIMITS.category },
    Verdict: { value: verdict, max: LIMITS.verdict },
    Experience: { value: summary, max: LIMITS.summary }
  });
  if (lenError) {
    return NextResponse.json({ error: lenError }, { status: 400 });
  }

  // Auto-classify (best-effort, time-boxed) so experiences group under a clean,
  // canonical topic and a normalized category — even if the author's wording
  // varies. Falls back to the raw title/category if the AI is off or slow.
  let topicLabel = title;
  try {
    const ai = await Promise.race([
      classifyReview({ title, summary, category }),
      new Promise((resolve) => setTimeout(() => resolve(null), 5000))
    ]);
    if (ai) {
      if (ai.category) category = ai.category;
      if (ai.topic) topicLabel = ai.topic;
    }
  } catch {
    // Ignore — keep the author-provided values.
  }

  const slug = topicSlug(topicLabel);

  try {
    const user = await getClerkUser(userId);
    const name = getPreferredUserName(user);

    const supabase = createServerSupabase();

    // If this topic already exists, adopt its canonical topic + category so the
    // new experience folds into the same thread instead of creating a near
    // duplicate ("iPhone 15" vs "iphone 15").
    let canonicalTopic = topicLabel;
    if (slug) {
      const { data: existing } = await supabase
        .from("reviews")
        .select("title, topic, category")
        .eq("topic_slug", slug)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existing) {
        canonicalTopic = existing.topic || existing.title || topicLabel;
        if (existing.category) category = existing.category;
      }
    }

    const baseRow = {
      title,
      summary,
      topic: canonicalTopic,
      category,
      // A question has no verdict: forming one is what it is asking for.
      verdict: kind === "question" ? null : verdict || null,
      author_name: name,
      user_id: userId,
      kind
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

    // Tell Bing and Yandex the thread changed, rather than waiting to be
    // crawled. Not awaited: a slow endpoint must never delay or fail a post.
    //
    // Only once the thread clears the indexation gate — submitting a page we
    // are simultaneously telling crawlers to ignore is a contradictory signal,
    // and burns goodwill on a protocol that costs nothing to use well.
    try {
      const { data: thread } = await supabase
        .from("reviews")
        .select("topic, title, summary")
        .eq("topic_slug", slug)
        // Experiences only: a thread holding nothing but an unanswered question
        // has nothing to read yet, and submitting it would contradict the
        // noindex it carries.
        .eq("kind", "experience");

      if (thread && isDiscussionIndexable(thread)) {
        pingIndexNow([`/discussions/${slug}`, "/discussions", "/"]);
      }
    } catch {
      // Never block a publish on a search-engine ping.
    }

    return NextResponse.json({ review });
  } catch (error) {
    const message = error?.message || "Failed to save review.";
    console.error("POST /api/reviews failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
