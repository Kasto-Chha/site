import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { createServerSupabase } from "../../../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../../../lib/admin/audit";
import { logDbError } from "../../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../../lib/requestBody";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was deleted.";

// Delete a business from Sync for good: the record and what hangs off it (QR codes, scan counts, private notes, owner replies,
// tasks, assignments). The thread and every post stay on KastoChha as ordinary community posts. It cannot be undone, so the
// caller must type the business's name exactly. Admin only. The record is written to the audit log first.
export async function POST(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  if (!UUID_RE.test(params.id || "")) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;

  const supabase = createServerSupabase();
  const found = await supabase.from("sync_merchants").select("*").eq("id", params.id).maybeSingle();
  if (found.error) {
    logDbError("sync delete read", found.error);
    return NextResponse.json({ error: "Could not load that business." }, { status: 500 });
  }
  if (!found.data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const typed = typeof parsed.data?.confirmName === "string" ? parsed.data.confirmName.trim() : "";
  if (!typed || typed !== String(found.data.business_name || "").trim()) {
    return NextResponse.json({ error: "Type the business's name exactly to delete it." }, { status: 400 });
  }

  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: "sync.merchant.delete",
      targetType: "sync_merchant",
      targetId: params.id,
      before: found.data,
      after: null
    });
  } catch (auditError) {
    console.error("sync delete:", auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }

  const removed = await supabase.from("sync_merchants").delete().eq("id", params.id).select("id");
  if (removed.error) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError("sync delete", removed.error);
    return NextResponse.json({ error: "Could not delete the business. Nothing was changed." }, { status: 500 });
  }
  if (!removed.data || removed.data.length === 0) {
    // Gone a moment ago, by someone else.
    await closeAuditEntry(supabase, auditId, { applied: false });
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  await closeAuditEntry(supabase, auditId, { applied: true, after: null });

  revalidatePath(`/discussions/${found.data.topic_slug}`);
  revalidatePath("/discussions");
  return NextResponse.json({ ok: true });
}
