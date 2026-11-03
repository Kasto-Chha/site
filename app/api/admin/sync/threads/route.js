import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import { CATEGORIES } from "../../../../../lib/categories";
import { logDbError } from "../../../../../lib/dbError";
import { searchThreads } from "../../../../../lib/sync/threads";

const CATEGORY_LABELS = CATEGORIES.map((c) => c.label);

// Admin only: find KastoChha threads to turn into business threads, one page at a time.
//   q         words to look for in titles, or a pasted discussion address
//   category  one of KastoChha's categories (anything else is ignored)
//   tagged    1 to include threads that are already business threads
//   offset    where this page starts
//   limit     page size (8 by default, 20 at most)
export async function GET(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  }
  const params = new URL(request.url).searchParams;
  const category = params.get("category") || "";
  try {
    const result = await searchThreads(createServerSupabase(), {
      q: params.get("q") || "",
      category: CATEGORY_LABELS.includes(category) ? category : "",
      includeTagged: params.get("tagged") === "1",
      offset: params.get("offset") || 0,
      limit: params.get("limit") || undefined
    });
    return NextResponse.json(result);
  } catch (error) {
    logDbError("admin sync thread search", error);
    return NextResponse.json({ error: "Could not search threads. Has migration 0019 been run?" }, { status: 500 });
  }
}
