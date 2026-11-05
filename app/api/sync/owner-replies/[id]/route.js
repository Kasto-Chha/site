import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../lib/admin/audit";
import { checkRateLimit, retryAfterSeconds } from "../../../../../lib/ratelimit";
import { BODY_LIMITS, readJsonBody } from "../../../../../lib/requestBody";
import { getMerchantById } from "../../../../../lib/sync/merchants";
import { REPLY_MAX, cleanReply, deleteReply, getReply, isOwnerOf, publicReply, updateReply } from "../../../../../lib/sync/ownerReplies";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = { error: "That reply was not found." };
const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

// Edit or delete a reply. The account CURRENTLY linked to the business may edit or delete its replies (a
// former owner may not: once unlinked, they are no one's to change but the team's). A team member may remove
// one, and that is recorded. Nobody edits someone else's words but the owner who wrote them.
async function context(id) {
  const supabase = createServerSupabase();
  const reply = await getReply(supabase, id);
  if (!reply) return { supabase, reply: null, merchant: null };
  // getMerchantById answers { merchant, error }. A lookup that FAILED is an error, not "no such business".
  const found = await getMerchantById(reply.merchant_id);
  if (found.error) throw Object.assign(new Error("lookup failed"), { code: "merchant_lookup" });
  return { supabase, reply, merchant: found.merchant };
}

export async function PUT(request, { params }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to edit your reply." }, { status: 401 });
  if (!UUID_RE.test(params.id || "")) return NextResponse.json(NOT_FOUND, { status: 404 });

  const limit = await checkRateLimit("write", userId);
  if (!limit.ok) return NextResponse.json({ error: "You are posting too fast. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.reset)) } });

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const text = cleanReply(parsed.data?.body);
  if (!text) return NextResponse.json({ error: "Write your reply first." }, { status: 400 });
  if (text.length > REPLY_MAX) return NextResponse.json({ error: `A reply can be at most ${REPLY_MAX.toLocaleString("en-US")} characters.` }, { status: 400 });

  try {
    const { supabase, reply, merchant } = await context(params.id);
    if (!reply || !merchant || merchant.status === "cancelled") return NextResponse.json(NOT_FOUND, { status: 404 });
    if (!isOwnerOf(merchant, userId)) return NextResponse.json({ error: "Only the verified owner of this business can edit this reply." }, { status: 403 });
    return NextResponse.json({ reply: publicReply(await updateReply(supabase, reply.id, text)) });
  } catch (error) {
    console.error("Owner reply not updated, error code:", error?.code || "unknown");
    return NextResponse.json({ error: "Could not save your reply. Please try again." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!UUID_RE.test(params.id || "")) return NextResponse.json(NOT_FOUND, { status: 404 });

  try {
    const { supabase, reply, merchant } = await context(params.id);
    if (!reply) return NextResponse.json(NOT_FOUND, { status: 404 });

    const owner = Boolean(merchant && merchant.status !== "cancelled" && isOwnerOf(merchant, userId));
    // Only asked of someone who is not the owner: an ordinary delete costs no role lookup.
    const admin = owner ? false : (await requireRole(ROLE.ADMIN)).ok;
    if (!owner && !admin) return NextResponse.json({ error: "Only the verified owner of this business can delete this reply." }, { status: 403 });

    if (!admin) {
      await deleteReply(supabase, reply.id);
      return NextResponse.json({ ok: true });
    }

    // A team member removing a business's words: recorded, naming which reply and whose, never what it said.
    let auditId;
    try {
      auditId = await openAuditEntry(supabase, {
        actorId: userId,
        action: "sync.owner_reply.remove",
        targetType: "sync_owner_reply",
        targetId: reply.id,
        before: { id: reply.id, merchant_id: reply.merchant_id, review_id: reply.review_id },
        after: null
      });
    } catch (auditError) {
      console.error("owner reply removal:", auditError.message);
      return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
    }
    try {
      await deleteReply(supabase, reply.id);
    } catch (error) {
      await closeAuditEntry(supabase, auditId, { applied: false });
      throw error;
    }
    await closeAuditEntry(supabase, auditId, { applied: true, after: null });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Owner reply not removed, error code:", error?.code || "unknown");
    return NextResponse.json({ error: "Could not remove the reply. Please try again." }, { status: 500 });
  }
}
