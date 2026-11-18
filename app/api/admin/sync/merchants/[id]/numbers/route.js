import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../../../lib/supabase/server";
import { syncAccess } from "../../../../../../../lib/sync/access";
import { isAssigned } from "../../../../../../../lib/sync/team";
import { closeAuditEntry, openAuditEntry } from "../../../../../../../lib/admin/audit";
import { logDbError } from "../../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../../lib/requestBody";
import { cleanNumbers, parseMonth, removeNumbers, saveNumbers } from "../../../../../../../lib/sync/googleNumbers";
import { stageInfo } from "../../../../../../../lib/sync/stage";
import { readStage } from "../../../../../../../lib/sync/stageStore";
import { nepalDay } from "../../../../../../../lib/sync/time";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

// The gate both handlers share. An admin may enter numbers for any business; an operator only for one assigned to them, and an
// unassigned one looks exactly like one that does not exist.
async function gate(params) {
  const authResult = await syncAccess();
  if (!authResult.ok) return { response: NextResponse.json({ error: "Unauthorized" }, { status: authResult.status }) };
  if (!UUID_RE.test(params.id || "")) return { response: NextResponse.json({ error: "Invalid id." }, { status: 400 }) };
  const supabase = createServerSupabase();
  if (!authResult.isAdmin && !(await isAssigned(supabase, authResult.userId, params.id))) return { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  const found = await supabase.from("sync_merchants").select("id").eq("id", params.id).maybeSingle();
  if (found.error) {
    logDbError("sync numbers merchant", found.error);
    return { response: NextResponse.json({ error: "Could not load that business." }, { status: 500 }) };
  }
  if (!found.data) return { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
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
    return { response: NextResponse.json({ error: "Could not save. Has migration 0030 been run?" }, { status: 500 }) };
  }
}

// Type in a month's Google numbers (or replace that month). The log keeps the business and the month, not the figures.
export async function PUT(request, { params }) {
  const g = await gate(params);
  if (g.response) return g.response;
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const { values, error } = cleanNumbers(parsed.data, nepalDay(Date.now()));
  if (error) return NextResponse.json({ error }, { status: 400 });

  // A Free business has no work done on its Google profile, so there is nothing to type in. A stage that cannot be read never blocks.
  try {
    const info = stageInfo(await readStage(g.supabase, params.id));
    if (info.known && info.stage === "free") return NextResponse.json({ error: "This business is on the Free plan: we do not work on its Google profile, so no numbers are entered." }, { status: 409 });
  } catch {
    // Not blocked by a failed read.
  }

  const done = await logged(g.supabase, g.authResult, "sync.numbers.save", params.id, { month: values.month.slice(0, 7) }, () => saveNumbers(g.supabase, params.id, values, g.authResult.userId));
  if (done.response) return done.response;
  return NextResponse.json({ ok: true, replaced: done.result.replaced });
}

// Remove one month that was typed by mistake: /numbers?month=2026-10.
export async function DELETE(request, { params }) {
  const g = await gate(params);
  if (g.response) return g.response;
  const month = parseMonth(new URL(request.url).searchParams.get("month"));
  if (!month) return NextResponse.json({ error: "Choose the month." }, { status: 400 });
  const done = await logged(g.supabase, g.authResult, "sync.numbers.delete", params.id, { month: month.slice(0, 7) }, () => removeNumbers(g.supabase, params.id, month));
  if (done.response) return done.response;
  if (!done.result) return NextResponse.json({ error: "Nothing was typed in for that month." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
