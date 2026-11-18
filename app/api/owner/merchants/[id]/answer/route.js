import { NextResponse } from "next/server";

import { ownerGate } from "../../../../../../lib/sync/ownerGate";
import { answerQuestion, cleanAnswer } from "../../../../../../lib/sync/ownerActions";
import { closeAuditEntry, openAuditEntry } from "../../../../../../lib/admin/audit";
import { logDbError } from "../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../lib/requestBody";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const AUDIT_FAILED = "Could not record this, so nothing was changed. Please try again.";

// An owner answers the team's question about a review: { id, answer }. The answer goes to the team only and is never posted as
// written. The audit log keeps who and which review, never the answer.
export async function POST(request, { params }) {
  const g = await ownerGate(params);
  if (g.response) return g.response;
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const { error, id, answer } = cleanAnswer(parsed.data);
  if (error) return NextResponse.json({ error }, { status: 400 });

  let auditId;
  try {
    auditId = await openAuditEntry(g.supabase, { actorId: g.userId, action: "sync.owner.answer", targetType: "sync_merchant", targetId: g.merchant.id, before: null, after: { kind: "reply", id } });
  } catch (auditError) {
    console.error("sync.owner.answer:", auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }
  try {
    const saved = await answerQuestion(g.supabase, g.merchant.id, id, answer, new Date().toISOString());
    await closeAuditEntry(g.supabase, auditId, { applied: true });
    if (!saved) return NextResponse.json({ error: "This question is no longer waiting for you." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (failure) {
    await closeAuditEntry(g.supabase, auditId, { applied: false });
    logDbError("sync.owner.answer", failure);
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  }
}
