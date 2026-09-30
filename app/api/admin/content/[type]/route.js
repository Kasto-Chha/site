import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import { getContentType, sanitizeContent } from "../../../../../lib/admin/contentTypes";
import { closeAuditEntry, openAuditEntry } from "../../../../../lib/admin/audit";
import { adminSaveMessage, logDbError } from "../../../../../lib/dbError";
import { pingIndexNow } from "../../../../../lib/seo/indexnow";
import { isFeaturedIndexable } from "../../../../../lib/seo/indexable";
import { BODY_LIMITS, readJsonBody } from "../../../../../lib/requestBody";

// GET  /api/admin/content/<type>      -> list rows
// POST /api/admin/content/<type>      -> create a row
export async function GET(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  }

  const config = getContentType(params.type);
  if (!config) {
    return NextResponse.json({ error: "Unknown content type." }, { status: 404 });
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from(config.table)
    .select("*")
    .order(config.order.column, { ascending: config.order.ascending });

  if (error) {
    logDbError(`admin list ${params.type}`, error);
    return NextResponse.json({ error: "Could not load content." }, { status: 500 });
  }

  return NextResponse.json({ rows: data });
}

export async function POST(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  }

  const config = getContentType(params.type);
  if (!config) {
    return NextResponse.json({ error: "Unknown content type." }, { status: 404 });
  }

  const parsed = await readJsonBody(request, BODY_LIMITS.admin);
  if (parsed.response) return parsed.response;
  const body = parsed.data;
  const { values, error: validationError } = sanitizeContent(params.type, body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const supabase = createServerSupabase();

  // The id is chosen here rather than by the database so the audit entry,
  // which is written first, can name the row it is about.
  const row = { id: crypto.randomUUID(), ...values };

  let auditId;
  try {
    auditId = await openAuditEntry(supabase, {
      actorId: authResult.userId,
      action: "content.create",
      targetType: params.type,
      targetId: row.id,
      after: row
    });
  } catch (error) {
    console.error(`admin create ${params.type}:`, error.message);
    return NextResponse.json(
      { error: "Could not record this change in the audit log, so nothing was saved." },
      { status: 500 }
    );
  }

  const { data, error } = await supabase.from(config.table).insert(row).select().single();

  if (error) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError(`admin create ${params.type}`, error);
    return NextResponse.json({ error: adminSaveMessage(error) }, { status: 500 });
  }
  await closeAuditEntry(supabase, auditId, { applied: true, after: data });

  if (params.type === "featured") {
    // Featured pages are cached (revalidate = 300). Without this, a newly
    // published article would not appear for up to five minutes — long enough
    // for an editor to assume the save failed and publish it twice.
    revalidatePath("/featured");
    revalidatePath("/");
    if (data?.slug) revalidatePath(`/featured/${data.slug}`);

    // A newly published article is the case IndexNow exists for. Gated the same
    // way the sitemap is, so we never submit a page tagged noindex.
    if (isFeaturedIndexable(data) && !data?.link_url) {
      pingIndexNow([`/featured/${data.slug || data.id}`, "/featured", "/"]);
    }
  }

  return NextResponse.json({ row: data });
}
