import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../../../../lib/supabase/server";
import { syncAccess } from "../../../../../../../../lib/sync/access";
import { isAssigned } from "../../../../../../../../lib/sync/team";
import { closeAuditEntry, openAuditEntry } from "../../../../../../../../lib/admin/audit";
import { logDbError } from "../../../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../../../lib/requestBody";
import { geminiConfigured, geminiGenerate } from "../../../../../../../../lib/gemini";
import { AI_DAILY_CAP, buildPrompt, cleanDraft, cleanDraftRequest, readAiSettings, takeDraft } from "../../../../../../../../lib/sync/aiReply";
import { stageInfo } from "../../../../../../../../lib/sync/stage";
import { readStage } from "../../../../../../../../lib/sync/stageStore";
import { nepalDay } from "../../../../../../../../lib/sync/time";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIT_FAILED = "Could not record this, so nothing was done. Please try again.";

// A first draft of a reply to one review: { stars, review, facts }. Nothing is saved or posted: the words come back to the form, where
// the team reads and edits them. An admin may use it for any business; an operator only for one assigned to them. Closed unless an admin
// has turned AI drafts on and the Gemini key is set. The audit log keeps who and which business, never the review or the draft.
export async function POST(request, { params }) {
  const authResult = await syncAccess();
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  if (!UUID_RE.test(params.id || "")) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const supabase = createServerSupabase();
  if (!authResult.isAdmin && !(await isAssigned(supabase, authResult.userId, params.id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const found = await supabase.from("sync_merchants").select("id, business_name, business_kind").eq("id", params.id).maybeSingle();
  if (found.error) {
    logDbError("sync ai draft merchant", found.error);
    return NextResponse.json({ error: "Could not load that business." }, { status: 500 });
  }
  if (!found.data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const info = stageInfo(await readStage(supabase, params.id));
    if (info.known && info.stage === "free") return NextResponse.json({ error: "This business is on the Free plan: we do not work on its Google profile." }, { status: 409 });
  } catch {
    // Not blocked by a failed read.
  }

  const settings = await readAiSettings(supabase);
  if (!settings.enabled) return NextResponse.json({ error: "AI drafts are switched off. An admin can turn them on in the Replies list." }, { status: 409 });
  if (!geminiConfigured()) return NextResponse.json({ error: "The AI service is not set up." }, { status: 503 });

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const { error, ...input } = cleanDraftRequest(parsed.data);
  if (error) return NextResponse.json({ error }, { status: 400 });

  let allowed;
  try {
    allowed = await takeDraft(supabase, params.id, nepalDay(Date.now()));
  } catch (failure) {
    logDbError("sync ai draft allowance", failure);
    return NextResponse.json({ error: "Could not check today's allowance. Has migration 0038 been run?" }, { status: 500 });
  }
  if (!allowed) return NextResponse.json({ error: `Today's ${AI_DAILY_CAP} AI drafts for this business are used. Write this one by hand, or try tomorrow.` }, { status: 429 });

  let auditId;
  try {
    auditId = await openAuditEntry(supabase, { actorId: authResult.userId, action: "sync.replies.ai_draft", targetType: "sync_merchant", targetId: params.id, before: null, after: { used: true } });
  } catch (auditError) {
    console.error("sync.replies.ai_draft:", auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }
  try {
    const prompt = buildPrompt({ businessName: found.data.business_name, businessKind: found.data.business_kind, ...input });
    const text = cleanDraft(await geminiGenerate({ ...prompt, temperature: 0.5, maxOutputTokens: 400 }));
    await closeAuditEntry(supabase, auditId, { applied: Boolean(text) });
    if (!text) return NextResponse.json({ error: "The AI gave nothing usable. Try again, or write it by hand." }, { status: 502 });
    return NextResponse.json({ ok: true, draft: text });
  } catch (failure) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    console.error("sync.replies.ai_draft:", failure?.message ? String(failure.message).slice(0, 80) : "failed");
    return NextResponse.json({ error: "The AI could not make a draft just now. Try again, or write it by hand." }, { status: 502 });
  }
}
