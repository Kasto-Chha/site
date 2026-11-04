import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import { closeAuditEntry, openAuditEntry } from "../../../../../lib/admin/audit";
import { adminSaveMessage, logDbError } from "../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../lib/requestBody";
import { validateCreate } from "../../../../../lib/sync/validate";
import { threadExists, threadTitleFor } from "../../../../../lib/sync/threads";
import { merchantTitle } from "../../../../../lib/sync/slug";
import { pinnedTitleFor } from "../../../../../lib/sync/threadPage";

const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

// Postgres says 23505 when an address is already taken. The checks below catch the
// ordinary case with a clear message; this catches two admins saving at once.
function takenMessage(error) {
  const text = `${error?.message || ""}`;
  if (text.includes("topic_slug")) return "That thread is already a business thread.";
  if (text.includes("slug")) return "That hub address is already used by another business.";
  return "That address is already taken.";
}

// Tag a business thread. Admin only. Either links a thread that already has posts
// (threadMode "existing") or starts one from "Name, Area" (threadMode "new").
export async function POST(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  }

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const { values, threadMode, error: validationError } = validateCreate(parsed.data);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const supabase = createServerSupabase();
  const context = "admin sync create merchant";

  try {
    const exists = await threadExists(supabase, values.topic_slug);
    if (threadMode === "existing" && !exists) {
      return NextResponse.json({ error: "That thread no longer has any posts, so it cannot be linked." }, { status: 400 });
    }
    if (threadMode === "new" && exists) {
      return NextResponse.json({ error: "A thread with this address already exists. Link that thread instead of starting a new one." }, { status: 409 });
    }

    const byThread = await supabase.from("sync_merchants").select("business_name").eq("topic_slug", values.topic_slug).maybeSingle();
    if (byThread.error) throw new Error(byThread.error.message);
    if (byThread.data) {
      return NextResponse.json({ error: `That thread is already a business thread (${byThread.data.business_name}).` }, { status: 409 });
    }
    const byHub = await supabase.from("sync_merchants").select("business_name").eq("slug", values.slug).maybeSingle();
    if (byHub.error) throw new Error(byHub.error.message);
    if (byHub.data) {
      return NextResponse.json({ error: `That hub address is already used by ${byHub.data.business_name}.` }, { status: 409 });
    }
  } catch (error) {
    logDbError(context, error);
    return NextResponse.json({ error: "Could not check the addresses. Has migration 0018 been run?" }, { status: 500 });
  }

  // The title a post must be sent under to land in this thread, pinned along with its address.
  let threadTitle;
  try {
    const wanted = threadMode === "existing" ? await threadTitleFor(supabase, values.topic_slug) : merchantTitle(values);
    threadTitle = pinnedTitleFor({ title: wanted, slug: values.topic_slug });
  } catch (error) {
    logDbError(context, error);
    return NextResponse.json({ error: "Could not read the thread's title. Has migration 0019 been run?" }, { status: 500 });
  }

  const row = { id: crypto.randomUUID(), ...values, thread_title: threadTitle, created_by: authResult.userId };

  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: "sync.merchant.create",
      targetType: "sync_merchant",
      targetId: row.id,
      before: null,
      after: row
    });
  } catch (auditError) {
    console.error(`${context}:`, auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }

  const { data, error: dbError } = await supabase.from("sync_merchants").insert(row).select().single();
  if (dbError) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError(context, dbError);
    const message = dbError.code === "23505" ? takenMessage(dbError) : adminSaveMessage(dbError);
    return NextResponse.json({ error: message }, { status: dbError.code === "23505" ? 409 : 500 });
  }
  await closeAuditEntry(supabase, auditId, { applied: true, after: data });

  revalidatePath(`/discussions/${data.topic_slug}`);
  revalidatePath("/discussions");
  return NextResponse.json({ merchant: data }, { status: 201 });
}
