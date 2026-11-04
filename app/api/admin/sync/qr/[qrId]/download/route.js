import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../../../lib/auth/roles";
import { logDbError } from "../../../../../../../lib/dbError";
import { topicSlug } from "../../../../../../../lib/slug";
import { qrPdf, qrPng } from "../../../../../../../lib/sync/qrImage";
import { qrUrlFor } from "../../../../../../../lib/sync/qr";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The QR code as a file: a PNG, or an A5 sheet to print. Admin only. What it encodes is the
// site's own address plus the code, shown in the admin beside the code, so nobody prints a code
// that points at a preview or a test site without seeing it first. ?inline=1 shows it in the
// page instead of downloading it (the small preview in the admin).
export async function GET(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  if (!UUID_RE.test(params.qrId || "")) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const query = new URL(request.url).searchParams;
  const format = query.get("format") === "pdf" ? "pdf" : "png";
  const inline = query.get("inline") === "1";

  const supabase = createServerSupabase();
  const context = "admin sync qr download";
  const qr = await supabase.from("sync_qr_codes").select("id, merchant_id, code, label").eq("id", params.qrId).maybeSingle();
  if (qr.error) {
    logDbError(context, qr.error);
    return NextResponse.json({ error: "Could not load that code." }, { status: 500 });
  }
  if (!qr.data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const merchant = await supabase.from("sync_merchants").select("slug, business_name, area").eq("id", qr.data.merchant_id).maybeSingle();
  if (merchant.error || !merchant.data) {
    if (merchant.error) logDbError(context, merchant.error);
    return NextResponse.json({ error: "Could not load that business." }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const target = qrUrlFor(siteUrl, qr.data.code);
  const name = `${merchant.data.slug}-${topicSlug(qr.data.label) || "qr"}`;

  try {
    const bytes = format === "pdf" ? qrPdf(target, { title: `${merchant.data.business_name}, ${merchant.data.area}` }) : await qrPng(target);
    return new Response(bytes, {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "image/png",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}.${format}"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    logDbError(context, error);
    return NextResponse.json({ error: "Could not make the file." }, { status: 500 });
  }
}
