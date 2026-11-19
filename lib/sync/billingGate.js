import { NextResponse } from "next/server";

import { createServerSupabase } from "../supabase/server";
import { logDbError } from "../dbError";
import { closeAuditEntry, openAuditEntry } from "../admin/audit";
import { readStage } from "./stageStore";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

// Money is for admins only: an operator never reaches any billing route. Returns the business and its stage row.
// The caller has already asked requireRole(ROLE.ADMIN) and passes the result in.
export async function billingGate(params, authResult) {
  if (!UUID_RE.test(params?.id || "")) return { response: NextResponse.json({ error: "Invalid id." }, { status: 400 }) };
  const supabase = createServerSupabase();
  const found = await supabase.from("sync_merchants").select("id, business_name, monthly_price").eq("id", params.id).maybeSingle();
  if (found.error) {
    logDbError("sync billing merchant", found.error);
    return { response: NextResponse.json({ error: "Could not load that business." }, { status: 500 }) };
  }
  if (!found.data) return { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  let stageRow = null;
  try {
    stageRow = await readStage(supabase, params.id);
  } catch {
    stageRow = null;
  }
  return { authResult, supabase, merchant: found.data, stageRow };
}

// Run a change under an audit entry: if the log cannot be written nothing happens. The log keeps ids and counts, never money or words.
export async function logged(g, action, targetId, after, work) {
  let auditId;
  try {
    auditId = await openAuditEntry(g.supabase, { actorId: g.authResult.userId, action, targetType: "sync_merchant", targetId, before: null, after });
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
    return { response: NextResponse.json({ error: "Could not save. Has migration 0039 been run?" }, { status: 500 }) };
  }
}
