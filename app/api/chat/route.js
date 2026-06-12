import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";

import { createServerSupabase } from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are KastoChha Assist, the friendly AI helper for KastoChha — a Nepali community platform where people share real, first-hand experiences, reviews, and opinions. ("Kasto chha?" means "How is it?" in Nepali.)

Your job: give honest, practical answers about products, services, places, careers, education, finance, housing, and everyday life — with a Nepal-first perspective. When community context is provided below, ground your answer in it and mention what the community thinks. When it isn't, answer from general knowledge and gently invite the user to share their own experience on KastoChha.

Style:
- Be concise, warm, and direct. Short paragraphs or tight bullet points.
- Mirror the user's language. If they write in Nepali or Romanized Nepali, reply the same way.
- Be balanced: mention pros and cons, rough costs, and tips when relevant.
- Never invent fake statistics, prices, or quotes. If unsure, say so.
- Respond directly with the final answer. Do not include exploratory reasoning, meta-commentary, or restate the question.`;

// Pull a small slice of community signal to ground the answer (best-effort).
async function getCommunityContext(query) {
  if (!query) return "";
  try {
    const supabase = createServerSupabase();
    const like = `%${query}%`;
    const [trendingRes, reviewsRes] = await Promise.all([
      supabase
        .from("trending_topics")
        .select("title, description, votes_yes, votes_no")
        .order("rank", { ascending: true })
        .limit(5),
      supabase
        .from("reviews")
        .select("title, summary, verdict, category")
        .ilike("title", like)
        .order("created_at", { ascending: false })
        .limit(5)
    ]);

    const lines = [];
    const reviews = reviewsRes.data || [];
    if (reviews.length) {
      lines.push("Recent community experiences matching the question:");
      for (const r of reviews) {
        const verdict = r.verdict ? ` [${r.verdict}]` : "";
        lines.push(`- ${r.title}${verdict}: ${(r.summary || "").slice(0, 240)}`);
      }
    }

    const trending = trendingRes.data || [];
    if (trending.length) {
      lines.push("", "Currently trending on KastoChha:");
      for (const t of trending) {
        const total = (t.votes_yes || 0) + (t.votes_no || 0);
        const pct = total ? Math.round(((t.votes_yes || 0) / total) * 100) : null;
        const sentiment = pct !== null ? ` (${pct}% positive, ${total} votes)` : "";
        lines.push(`- ${t.title}${sentiment}`);
      }
    }

    return lines.join("\n");
  } catch {
    return "";
  }
}

function normalizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const cleaned = raw
    .map((m) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: (m?.content || "").toString().trim()
    }))
    .filter((m) => m.content)
    .slice(-20);

  // The API requires the conversation to start with a user turn.
  while (cleaned.length && cleaned[0].role !== "user") cleaned.shift();
  return cleaned;
}

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "AI is not configured. Set ANTHROPIC_API_KEY." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const payload = await request.json().catch(() => ({}));
  const messages = normalizeMessages(payload.messages);

  if (!messages.length) {
    return new Response(JSON.stringify({ error: "No message provided." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const query = lastUser?.content || "";

  // Log the query (best-effort, non-blocking).
  let userId = null;
  try {
    ({ userId } = await auth());
  } catch {
    userId = null;
  }
  try {
    const supabase = createServerSupabase();
    await supabase.from("chat_queries").insert({ query, user_id: userId || null });
  } catch {
    // Logging failures must not break the chat.
  }

  const context = await getCommunityContext(query);
  const system = context
    ? `${SYSTEM_PROMPT}\n\n--- COMMUNITY CONTEXT ---\n${context}\n--- END CONTEXT ---`
    : SYSTEM_PROMPT;

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const ai = client.messages.stream({
          model: "claude-opus-4-8",
          max_tokens: 2048,
          output_config: { effort: "low" },
          system,
          messages
        });

        for await (const event of ai) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (error) {
        console.error("POST /api/chat stream failed:", error?.message || error);
        controller.enqueue(
          encoder.encode(
            "\n\nSorry — I ran into a problem reaching the assistant. Please try again."
          )
        );
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no"
    }
  });
}
