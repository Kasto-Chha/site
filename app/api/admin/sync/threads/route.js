import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import { logDbError } from "../../../../../lib/dbError";
import { searchThreads } from "../../../../../lib/sync/threads";

// Admin only: find KastoChha threads to turn into business threads.
export async function GET(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  }
  const q = new URL(request.url).searchParams.get("q") || "";
  try {
    const threads = await searchThreads(createServerSupabase(), q);
    return NextResponse.json({ threads });
  } catch (error) {
    logDbError("admin sync thread search", error);
    return NextResponse.json({ error: "Could not search threads." }, { status: 500 });
  }
}
