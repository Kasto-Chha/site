import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../../../lib/supabase/server";
import { syncAccess } from "../../../../../../../lib/sync/access";
import { isAssigned } from "../../../../../../../lib/sync/team";
import { closeAuditEntry, openAuditEntry } from "../../../../../../../lib/admin/audit";
import { logDbError } from "../../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../../lib/requestBody";
import { cleanWhatsapp, markMessaged, saveWhatsapp } from "../../../../../../../lib/sync/ownerMessage";
import { stageInfo } from "../../../../../../../lib/sync/stage";
import { readStage } from "../../../../../../../lib/sync/stageStore";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";
const FREE = "This business is on the Free plan: we do not work on it, so there is nothing to message the owner about.";

// An admin may use this for any business; an operator only for one assigned to them (an unassigned one looks like it does not
// exist). A Free business is held. A stage that cannot be read never blocks.
async function gate(params) {
  const authResult = await syncAccess();
  if (!authResult.ok) return { response: NextResponse.json({ error: "Unauthorized" }, { status: authResult.status }) };
  if (!UUID_RE.test(params.id || "")) return { response: NextResponse.json({ error: "Invalid id." }, { status: 400 }) };
  const supabase = createServerSupabase();
  if (!authResult.isAdmin && !(await isAssigned(supabase, authResult.userId, params.id))) return { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  const found = await supabase.from("sync_merchants").select("id").eq("id", params.id).maybeSingle();
  if (found.error) {
    logDbError("sync owner message merchant", found.error);
    return { response: NextResponse.json({ error: "Could not load that business." }, { status: 500 }) };
  }
  if (!found.data) return { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  try {
    const info = stageInfo(await readStage(supabase, params.id));
    if (info.known && info.stage === "free") return { response: NextResponse.json({ error: FREE }, { status: 409 }) };
  } catch {
    // Not blocked by a failed read.
  }
  return { authResult, supabase };
}

// The audit log keeps who and what, never the number itself.
async function logged(g, action, merchantId, after, work) {
  let auditId;
  try {
    auditId = await openAuditEntry(g.supabase, { actorId: g.authResult.userId, action, targetType: "sync_merchant", targetId: merchantId, before: null, after });
  } catch (auditError) {
    console.error(`${action}:`, auditError.message);
    return { response: NextResponse.json({ error: AUDIT_FAILED }, { status: 500 }) };
  }
  try {
    const result = await work();
    await closeAuditEntry(g.supabase, auditId, { applied: true });
    return { result };
  } catch (error) {
    await closeAuditEntry(g.supabase, auditId, { applied: false });
    logDbError(action, error);
    return { response: NextResponse.json({ error: "Could not save. Has migration 0037 been run?" }, { status: 500 }) };
  }
}

// Save the owner's WhatsApp number: { whatsapp: "9841 000 000" }. A blank clears it.
export async function PUT(request, { params }) {
  const g = await gate(params);
  if (g.response) return g.response;
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const input = parsed.data;
  if (!input || typeof input !== "object" || Array.isArray(input) || !Object.prototype.hasOwnProperty.call(input, "whatsapp")) return NextResponse.json({ error: "Type the number first." }, { status: 400 });
  const cleaned = cleanWhatsapp(input.whatsapp);
  if (cleaned.error) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const out = await logged(g, "sync.owner_message.number", params.id, { has_number: Boolean(cleaned.value) }, () => saveWhatsapp(g.supabase, params.id, cleaned.value));
  if (out.response) return out.response;
  return NextResponse.json({ ok: true, whatsapp: cleaned.value });
}

// Record that the team has messaged the owner now, so nobody sends the same reminder twice.
export async function POST(request, { params }) {
  const g = await gate(params);
  if (g.response) return g.response;
  const now = new Date().toISOString();
  const out = await logged(g, "sync.owner_message.sent", params.id, { sent: true }, () => markMessaged(g.supabase, params.id, now));
  if (out.response) return out.response;
  return NextResponse.json({ ok: true, messagedAt: now });
}
