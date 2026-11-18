import { NextResponse } from "next/server";

import { ownerGate } from "../../../../../../lib/sync/ownerGate";
import { approveAllMenu, cleanDecision, decide } from "../../../../../../lib/sync/ownerActions";
import { closeAuditEntry, openAuditEntry } from "../../../../../../lib/admin/audit";
import { logDbError } from "../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../lib/requestBody";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const AUDIT_FAILED = "Could not record this, so nothing was changed. Please try again.";

// An owner answers something waiting for them: { kind: "menu"|"post"|"reply", id, decision: "approve"|"change", note? } or
// { kind: "menu", decision: "approve_all" }. The business is the signed-in owner's own, found on the server. The audit log keeps who,
// what kind and which one, never the words of the comment.
export async function POST(request, { params }) {
  const g = await ownerGate(params);
  if (g.response) return g.response;
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const { error, ...decision } = cleanDecision(parsed.data);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const action = `sync.owner.${decision.decision}`;
  let auditId;
  try {
    auditId = await openAuditEntry(g.supabase, { actorId: g.userId, action, targetType: "sync_merchant", targetId: g.merchant.id, before: null, after: { kind: decision.kind, id: decision.id || null } });
  } catch (auditError) {
    console.error(`${action}:`, auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }
  const now = new Date().toISOString();
  try {
    const result = decision.decision === "approve_all" ? await approveAllMenu(g.supabase, g.merchant.id, now) : await decide(g.supabase, g.merchant.id, decision, now);
    await closeAuditEntry(g.supabase, auditId, { applied: true });
    if (decision.decision === "approve_all") return NextResponse.json({ ok: true, changed: result });
    if (!result) return NextResponse.json({ error: "This is no longer waiting for you." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (failure) {
    await closeAuditEntry(g.supabase, auditId, { applied: false });
    logDbError(action, failure);
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  }
}
