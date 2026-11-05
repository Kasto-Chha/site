import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../../../lib/auth/roles";
import { describeClerkUser, getClerkUser } from "../../../../../../../lib/auth/clerk";
import { closeAuditEntry, openAuditEntry } from "../../../../../../../lib/admin/audit";
import { adminSaveMessage, logDbError } from "../../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../../lib/requestBody";
import { getMerchantById } from "../../../../../../../lib/sync/merchants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_ID_RE = /^[A-Za-z0-9_-]{5,100}$/;
const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

// Link one account to a business as its verified owner, or unlink it. Admin only, and recorded. The team does
// it by hand, after the owner has proved who they are: that is what the "Verified business" label stands on.
// The audit log keeps account ids, never emails or names.
async function change(request, params, wanted) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return { response: NextResponse.json({ error: "Unauthorized" }, { status: authResult.status }) };
  if (!UUID_RE.test(params.id || "")) return { response: NextResponse.json({ error: "Invalid id." }, { status: 400 }) };

  let account = null;
  if (wanted === "link") {
    const parsed = await readJsonBody(request, BODY_LIMITS.small);
    if (parsed.response) return { response: parsed.response };
    const userId = parsed.data?.userId;
    if (typeof userId !== "string" || !USER_ID_RE.test(userId)) return { response: NextResponse.json({ error: "Choose an account first." }, { status: 400 }) };
    try {
      account = describeClerkUser(await getClerkUser(userId));
    } catch {
      return { response: NextResponse.json({ error: "That account was not found." }, { status: 404 }) };
    }
    // The label means "we know who this is": an email nobody has proved they control does not say that.
    if (!account.verified) return { response: NextResponse.json({ error: "That account's email has not been verified, so we cannot be sure who it belongs to." }, { status: 409 }) };
  }

  // getMerchantById answers { merchant, error }: a failed lookup is an error, not "not found".
  const found = await getMerchantById(params.id);
  if (found.error) return { response: NextResponse.json({ error: "Could not load this business." }, { status: 500 }) };
  const merchant = found.merchant;
  if (!merchant) return { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  if (merchant.status === "cancelled") return { response: NextResponse.json({ error: "This business's tag was removed. Tag it again before linking an owner." }, { status: 409 }) };
  return { authResult, merchant, account };
}

async function apply({ authResult, merchant, account }, owner) {
  const supabase = createServerSupabase();
  const context = owner ? "admin sync link owner" : "admin sync unlink owner";
  const before = merchant.owner_user_id || null;
  if (before === owner) return NextResponse.json({ owner: account });

  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: owner ? "sync.owner.link" : "sync.owner.unlink",
      targetType: "sync_merchant",
      targetId: merchant.id,
      before: { owner_user_id: before },
      after: { owner_user_id: owner }
    });
  } catch (auditError) {
    console.error(`${context}:`, auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }
  const { error } = await supabase.from("sync_merchants").update({ owner_user_id: owner }).eq("id", merchant.id);
  if (error) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError(context, error);
    return NextResponse.json({ error: adminSaveMessage(error) }, { status: 500 });
  }
  await closeAuditEntry(supabase, auditId, { applied: true, after: { owner_user_id: owner } });
  return NextResponse.json({ owner: account });
}

export async function PUT(request, { params }) {
  const checked = await change(request, params, "link");
  if (checked.response) return checked.response;
  return apply(checked, checked.account.id);
}

export async function DELETE(request, { params }) {
  const checked = await change(request, params, "unlink");
  if (checked.response) return checked.response;
  return apply(checked, null);
}
