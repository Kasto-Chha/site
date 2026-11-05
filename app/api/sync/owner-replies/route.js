import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../../lib/supabase/server";
import { checkRateLimit, retryAfterSeconds } from "../../../../lib/ratelimit";
import { BODY_LIMITS, readJsonBody } from "../../../../lib/requestBody";
import { getMerchantByTopicSlug } from "../../../../lib/sync/merchants";
import { REPLY_MAX, cleanReply, createReply, isOwnerOf, publicReply } from "../../../../lib/sync/ownerReplies";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A business's reply to one post on its own page. Only the account the team linked to that business may write
// it, and only on a post in that business's thread: the owner is found from the POST, never from anything the
// browser says about itself. One reply per post (the database refuses a second). The reply is stored apart
// from the posts, so it is never counted as an experience.
export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to reply." }, { status: 401 });

  const limit = await checkRateLimit("write", userId);
  if (!limit.ok) {
    return NextResponse.json({ error: "You are posting too fast. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.reset)) } });
  }

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const { reviewId, body } = parsed.data || {};
  if (typeof reviewId !== "string" || !UUID_RE.test(reviewId)) return NextResponse.json({ error: "Choose a post to reply to." }, { status: 400 });
  const text = cleanReply(body);
  if (!text) return NextResponse.json({ error: "Write your reply first." }, { status: 400 });
  if (text.length > REPLY_MAX) return NextResponse.json({ error: `A reply can be at most ${REPLY_MAX.toLocaleString("en-US")} characters.` }, { status: 400 });

  const supabase = createServerSupabase();
  try {
    const post = await supabase.from("reviews").select("id, topic_slug").eq("id", reviewId).maybeSingle();
    if (post.error) throw Object.assign(new Error("lookup failed"), { code: post.error.code });
    if (!post.data) return NextResponse.json({ error: "That post was not found." }, { status: 404 });

    const merchant = post.data.topic_slug ? await getMerchantByTopicSlug(post.data.topic_slug) : null;
    if (!merchant) return NextResponse.json({ error: "That post is not on a business's page." }, { status: 404 });
    if (!isOwnerOf(merchant, userId)) {
      return NextResponse.json({ error: "Only the verified owner of this business can reply here." }, { status: 403 });
    }

    const reply = await createReply(supabase, { merchantId: merchant.id, reviewId, userId, body: text });
    return NextResponse.json({ reply: publicReply(reply) }, { status: 201 });
  } catch (error) {
    if (error?.code === "23505") return NextResponse.json({ error: "You have already replied to this post. Edit your reply instead." }, { status: 409 });
    console.error("Owner reply not saved, error code:", error?.code || "unknown");
    return NextResponse.json({ error: "Could not post your reply. Please try again." }, { status: 500 });
  }
}
