import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../../../lib/supabase/server";
import { syncAccess } from "../../../../../../../lib/sync/access";
import { isAssigned } from "../../../../../../../lib/sync/team";
import { closeAuditEntry, openAuditEntry } from "../../../../../../../lib/admin/audit";
import { logDbError } from "../../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../../lib/requestBody";
import { checkFinal, cleanReply, createReply, deleteReply, getReply, updateReply } from "../../../../../../../lib/sync/replies";
import { stageInfo } from "../../../../../../../lib/sync/stage";
import { readStage } from "../../../../../../../lib/sync/stageStore";
import { nepalDay } from "../../../../../../../lib/sync/time";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";
const FREE = "This business is on the Free plan: we do not work on its Google profile, so no replies are kept.";

// An admin may use this for any business; an operator only for one assigned to them (an unassigned one looks like it does not
// exist). A Free business is held. A stage that cannot be read never blocks.
async function gate(params, { allowFree = false } = {}) {
  const authResult = await syncAccess();
  if (!authResult.ok) return { response: NextResponse.json({ error: "Unauthorized" }, { status: authResult.status }) };
  if (!UUID_RE.test(params.id || "")) return { response: NextResponse.json({ error: "Invalid id." }, { status: 400 }) };
  const supabase = createServerSupabase();
  if (!authResult.isAdmin && !(await isAssigned(supabase, authResult.userId, params.id))) return { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  const found = await supabase.from("sync_merchants").select("id").eq("id", params.id).maybeSingle();
  if (found.error) {
    logDbError("sync replies merchant", found.error);
    return { response: NextResponse.json({ error: "Could not load that business." }, { status: 500 }) };
  }
  if (!found.data) return { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  try {
    const info = stageInfo(await readStage(supabase, params.id));
    if (!allowFree && info.known && info.stage === "free") return { response: NextResponse.json({ error: FREE }, { status: 409 }) };
  } catch {
    // Not blocked by a failed read.
  }
  return { authResult, supabase };
}

async function logged(supabase, authResult, action, merchantId, after, work) {
  let auditId;
  try {
    auditId = await openAuditEntry(supabase, { actorId: authResult.userId, action, targetType: "sync_merchant", targetId: merchantId, before: null, after });
  } catch (auditError) {
    console.error(`${action}:`, auditError.message);
    return { response: NextResponse.json({ error: AUDIT_FAILED }, { status: 500 }) };
  }
  try {
    const result = await work();
    await closeAuditEntry(supabase, auditId, { applied: true });
    return { result };
  } catch (error) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError(action, error);
    return { response: NextResponse.json({ error: "Could not save. Has migration 0033 been run?" }, { status: 500 }) };
  }
}

const UUID = (v) => UUID_RE.test(String(v || ""));
const nowIso = () => new Date().toISOString();

// A Free business is held for new replies and changes, but its replies can still be removed.
async function gateWrite(params) {
  return gate(params, { allowFree: false });
}

// Add a review that needs an answer: { reviewer, stars?, review?, review_on?, draft?, status? }. It starts as New unless it says otherwise.
export async function POST(request, { params }) {
  const g = await gateWrite(params);
  if (g.response) return g.response;
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const { values, error } = cleanReply(parsed.data);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const problem = checkFinal({ status: "new", draft: "", ...values });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (values.status === "posted") values.posted_on = nepalDay(Date.now());
  const done = await logged(g.supabase, g.authResult, "sync.replies.create", params.id, { status: values.status || "new" }, () => createReply(g.supabase, params.id, values, g.authResult.userId, nowIso()));
  if (done.response) return done.response;
  return NextResponse.json({ ok: true, id: done.result.id });
}

// Change a reply: { replyId, ...fields }. Marking it posted records the day; moving it back clears that day.
export async function PATCH(request, { params }) {
  const g = await gateWrite(params);
  if (g.response) return g.response;
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const postId = parsed.data?.replyId;
  if (!UUID(postId)) return NextResponse.json({ error: "Invalid reply." }, { status: 400 });
  const { replyId: _ignored, ...fields } = parsed.data;
  const { values, error } = cleanReply(fields, { partial: true });
  if (error) return NextResponse.json({ error }, { status: 400 });
  let existing;
  try {
    existing = await getReply(g.supabase, params.id, postId);
  } catch (readError) {
    logDbError("sync reply read", readError);
    return NextResponse.json({ error: "Could not load that reply." }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const problem = checkFinal({ ...existing, ...values });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const status = values.status || existing.status;
  if (status === "posted" && existing.status !== "posted") values.posted_on = nepalDay(Date.now());
  if (status !== "posted" && existing.status === "posted") values.posted_on = null;
  const done = await logged(g.supabase, g.authResult, "sync.replies.update", params.id, { replyId: postId, status }, () => updateReply(g.supabase, params.id, postId, values, nowIso()));
  if (done.response) return done.response;
  return NextResponse.json({ ok: true });
}

// Remove a reply: /replies?reply=<id>.
export async function DELETE(request, { params }) {
  const g = await gate(params, { allowFree: true });
  if (g.response) return g.response;
  const postId = new URL(request.url).searchParams.get("reply");
  if (!UUID(postId)) return NextResponse.json({ error: "Invalid reply." }, { status: 400 });
  const done = await logged(g.supabase, g.authResult, "sync.replies.delete", params.id, { replyId: postId }, () => deleteReply(g.supabase, params.id, postId));
  if (done.response) return done.response;
  if (!done.result) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
