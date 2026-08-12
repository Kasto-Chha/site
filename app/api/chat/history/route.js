import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../../lib/supabase/server";
import { getChatTopicMessages, searchUserChatTopics } from "../../../../lib/supabase/queries";
import { topicTitle } from "../../../../lib/chatTopics";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export const dynamic = "force-dynamic";

// A signed-in user's own chat conversations.
//
//   GET    ?topicId=<id>   -> every turn in that conversation, oldest first
//   GET    ?q=<term>       -> their conversations whose title matches
//   PATCH  { id, title }   -> rename a conversation
//   DELETE { id }          -> delete a conversation and its messages
//   DELETE { all: true }   -> delete all of them
//
// Every one of these is scoped to the caller's own user_id, so a guessed or
// replayed topic id belonging to someone else reads and writes nothing — even
// though the service-role client we use here bypasses RLS.
export async function GET(request) {
  const { userId } = await auth();
  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { searchParams } = new URL(request.url);
  const topicId = (searchParams.get("topicId") || "").trim();
  const term = (searchParams.get("q") || "").trim();

  if (topicId) {
    const messages = await getChatTopicMessages(topicId, userId);
    return jsonResponse({ messages });
  }

  if (term) {
    const topics = await searchUserChatTopics(userId, term);
    return jsonResponse({ topics });
  }

  return jsonResponse({ error: "Provide a topicId or a q search term." }, 400);
}

export async function PATCH(request) {
  const { userId } = await auth();
  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const payload = await request.json().catch(() => ({}));
  const id = (payload.id || "").toString().trim();
  const title = topicTitle((payload.title || "").toString());

  if (!id) {
    return jsonResponse({ error: "Provide an id." }, 400);
  }
  if (!payload.title || !payload.title.toString().trim()) {
    return jsonResponse({ error: "A title is required." }, 400);
  }

  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("chat_topics")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id, title")
      .maybeSingle();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }
    if (!data) {
      return jsonResponse({ error: "Not found." }, 404);
    }
    return jsonResponse({ ok: true, topic: data });
  } catch (error) {
    return jsonResponse({ error: error?.message || "Rename failed." }, 500);
  }
}

export async function DELETE(request) {
  const { userId } = await auth();
  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const payload = await request.json().catch(() => ({}));
  const id = (payload.id || "").toString().trim();
  const all = payload.all === true;

  if (!id && !all) {
    return jsonResponse({ error: "Provide an id or all:true." }, 400);
  }

  try {
    const supabase = createServerSupabase();
    // Messages go with the topic via the on-delete-cascade foreign key, so
    // there is no second statement to keep in sync here.
    let query = supabase.from("chat_topics").delete().eq("user_id", userId);
    if (!all) query = query.eq("id", id);

    const { error } = await query;
    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ error: error?.message || "Delete failed." }, 500);
  }
}
