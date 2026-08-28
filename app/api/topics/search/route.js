import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../lib/supabase/server";
import { searchTokens, ilikeAnyClause, relevanceScore } from "../../../../lib/search";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Existing threads matching what someone is typing into the topic field.
//
// Without this, the share form matched exactly: type "Sandar Momo Jhamsikhel"
// when a "Sandar Momo" thread exists and you get a second thread, because the
// slugs differ by one word. Do that a few times and one restaurant is spread
// across four pages, none of which has enough on it to be worth reading.
//
// The answer is not to merge them automatically — "Sandar momo price" and
// "Sandar momo Jhamsikhel" are genuinely different questions, the same way
// "byd ko battery" and "byd ko resale value" are. Guessing they are the same
// destroys a real distinction.
//
// So: show what exists and let the person decide. They know whether they are
// adding to the conversation or starting a new one.
//
// Public data (threads are listed on /discussions anyway) so no auth needed,
// but it goes through the server because RLS denies the browser key direct
// access to `reviews`.
// ---------------------------------------------------------------------------

export async function GET(request) {
  const query = new URL(request.url).searchParams.get("q") || "";
  const tokens = searchTokens(query, { minLength: 2 });

  // Nothing meaningful typed yet — no suggestions rather than everything.
  if (!tokens.length) {
    return NextResponse.json({ topics: [] });
  }

  try {
    const supabase = createServerSupabase();

    const { data, error } = await supabase
      .from("reviews")
      .select("topic, title, summary, topic_slug, kind, category, created_at")
      .or(ilikeAnyClause(tokens, ["topic", "title", "summary"]))
      .order("created_at", { ascending: false })
      // Wider than what is shown: these collapse into threads below, and a
      // busy thread would otherwise crowd out every other match.
      .limit(60);

    if (error) {
      console.warn("[topics/search]", error.message);
      return NextResponse.json({ topics: [] });
    }

    // One entry per thread, not per row.
    const threads = new Map();
    for (const row of data || []) {
      if (!row.topic_slug) continue;

      const existing = threads.get(row.topic_slug);
      if (existing) {
        if (row.kind === "experience") {
          existing.experiences += 1;
        } else if (row.kind === "question" && !existing.question) {
          existing.question = {
            topic: row.topic || row.title || row.topic_slug,
            category: row.category || "",
            question: row.title || row.topic || row.topic_slug
          };
        }
        continue;
      }

      threads.set(row.topic_slug, {
        slug: row.topic_slug,
        category: row.category || "",
        title: row.topic || row.title || row.topic_slug,
        experiences: row.kind === "experience" ? 1 : 0,
        question: row.kind === "question"
          ? {
              topic: row.topic || row.title || row.topic_slug,
              category: row.category || "",
              question: row.title || row.topic || row.topic_slug
            }
          : null,
        preview: (row.summary || "").slice(0, 90)
      });
    }

    const ranked = [...threads.values()]
      .map((thread) => ({
        thread,
        score: relevanceScore(tokens, {
          heading: thread.title,
          body: thread.preview
        })
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Equal relevance: the busier thread is the more useful one to join.
        return b.thread.experiences - a.thread.experiences;
      })
      .slice(0, 5)
      .map((entry) => entry.thread);

    return NextResponse.json({ topics: ranked });
  } catch (error) {
    console.warn("[topics/search]", error?.message || error);
    // Suggestions are an aid, never a gate: if this fails the form still works
    // exactly as it did before.
    return NextResponse.json({ topics: [] });
  }
}
