import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import { CSV_BOM, exportFilename } from "../../../../../lib/sync/csv";
import { EXPORT_KINDS, buildExport } from "../../../../../lib/sync/exports";
import { parseRange } from "../../../../../lib/sync/overview";

// Download one of the team's tables as a CSV: /api/admin/sync/export?kind=businesses|qr-codes|activity[&range=7d|30d|all].
// Admin only. Never cached. The file is whole or it is not made: a failed read answers with an error and no file.
export async function GET(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });

  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  if (!EXPORT_KINDS.includes(kind)) return NextResponse.json({ error: "Choose what to export: businesses, qr-codes or activity." }, { status: 400 });

  const now = Date.now();
  try {
    const built = await buildExport(createServerSupabase(), kind, { range: parseRange(params.get("range") || "30d"), now });
    return new Response(CSV_BOM + built.text, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(built.kind, built.suffix, now)}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Sync export failed:", error?.message || error);
    return NextResponse.json(
      { error: error?.expected ? error.message : "Could not build the export. Nothing was downloaded. Try again in a moment." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
