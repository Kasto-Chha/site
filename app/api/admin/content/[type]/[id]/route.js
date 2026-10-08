import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { createServerSupabase } from "../../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../../lib/auth/roles";
import { getContentType, sanitizeContent } from "../../../../../../lib/admin/contentTypes";
import { closeAuditEntry, openAuditEntry } from "../../../../../../lib/admin/audit";
import { adminSaveMessage, logDbError } from "../../../../../../lib/dbError";
import { pingIndexNow } from "../../../../../../lib/seo/indexnow";
import { isFeaturedIndexable } from "../../../../../../lib/seo/indexable";
import { BODY_LIMITS, readJsonBody } from "../../../../../../lib/requestBody";
import { TRENDING_SEARCH_TAG } from "../../../../../../lib/trendingSearches";

// Rules for the homepage's "Trending searches" row. The list is cached (see
// getTrendingChatSearches), and a hide rule exists to take something down now,
// not when the cache next expires.
function refreshTrendingSearches(type) {
  if (type === "searches") revalidateTag(TRENDING_SEARCH_TAG);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";

function resolve(params) {
  const config = getContentType(params.type);
  if (!config) return { error: NextResponse.json({ error: "Unknown content type." }, { status: 404 }) };
  if (!UUID_RE.test(params.id || "")) {
    return { error: NextResponse.json({ error: "Invalid id." }, { status: 400 }) };
  }
  return { config };
}

// The row as it stands, for the audit entry's `before`. { row: null } when it
// does not exist; { error } when the lookup itself failed.
async function currentRow(supabase, config, id, context) {
  const { data, error } = await supabase.from(config.table).select("*").eq("id", id).maybeSingle();
  if (error) {
    logDbError(context, error);
    return { error: NextResponse.json({ error: "Could not load that entry." }, { status: 500 }) };
  }
  return { row: data };
}

export async function GET(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  }
  const { config, error } = resolve(params);
  if (error) return error;

  const supabase = createServerSupabase();
  const found = await currentRow(supabase, config, params.id, `admin read ${params.type}`);
  if (found.error) return found.error;
  if (!found.row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ row: found.row });
}

export async function PUT(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  }
  const { config, error } = resolve(params);
  if (error) return error;

  const parsed = await readJsonBody(request, BODY_LIMITS.admin);
  if (parsed.response) return parsed.response;
  const body = parsed.data;
  const { values, error: validationError } = sanitizeContent(params.type, body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const context = `admin update ${params.type}`;

  const found = await currentRow(supabase, config, params.id, context);
  if (found.error) return found.error;
  if (!found.row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: "content.update",
      targetType: params.type,
      targetId: params.id,
      before: found.row,
      after: { ...found.row, ...values }
    });
  } catch (auditError) {
    console.error(`${context}:`, auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }

  const { data, error: dbError } = await supabase
    .from(config.table)
    .update(values)
    .eq("id", params.id)
    .select()
    .single();

  if (dbError) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError(context, dbError);
    return NextResponse.json({ error: adminSaveMessage(dbError) }, { status: 500 });
  }
  await closeAuditEntry(supabase, auditId, { applied: true, after: data });
  refreshTrendingSearches(params.type);

  if (params.type === "featured") {
    // Drop the cached copies so the edit is visible immediately rather than
    // after the 5-minute revalidate window.
    revalidatePath("/featured");
    revalidatePath("/");
    if (data?.slug) revalidatePath(`/featured/${data.slug}`);

    // An edited article is a changed page — worth re-submitting, and the reason
    // featured_stories.updated_at exists. Same gate as everywhere else.
    if (isFeaturedIndexable(data) && !data?.link_url) {
      pingIndexNow([`/featured/${data.slug || data.id}`, "/featured"]);
    }
  }

  return NextResponse.json({ row: data });
}

export async function DELETE(request, { params }) {
  // Deleting content is restricted to super admins.
  const authResult = await requireRole(ROLE.SUPER_ADMIN);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.status === 403 ? "Only super admins can delete content." : "Unauthorized" },
      { status: authResult.status }
    );
  }
  const { config, error } = resolve(params);
  if (error) return error;

  const supabase = createServerSupabase();
  const context = `admin delete ${params.type}`;

  // Read first: the audit entry keeps the deleted row, which is the only copy
  // left afterwards.
  const found = await currentRow(supabase, config, params.id, context);
  if (found.error) return found.error;
  if (!found.row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: "content.delete",
      targetType: params.type,
      targetId: params.id,
      before: found.row
    });
  } catch (auditError) {
    console.error(`${context}:`, auditError.message);
    return NextResponse.json({ error: AUDIT_FAILED }, { status: 500 });
  }

  const { error: dbError } = await supabase.from(config.table).delete().eq("id", params.id);

  if (dbError) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError(context, dbError);
    return NextResponse.json({ error: "Could not delete. Please try again." }, { status: 500 });
  }
  await closeAuditEntry(supabase, auditId, { applied: true });
  refreshTrendingSearches(params.type);

  // A deleted article must disappear from the cached listing too, or it stays
  // visible for up to five minutes after being removed.
  if (params.type === "featured") {
    revalidatePath("/featured");
    revalidatePath("/");
  }

  return NextResponse.json({ ok: true });
}
