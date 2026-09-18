import { createServerSupabase } from "../../../../lib/supabase/server";

// Called by the embeddable badge widget (public/badge-widget.js), from
// whatever third-party site it's embedded on — genuinely cross-origin,
// unlike the rest of this app's API routes, which only ever get called
// from kastochhanepal.com itself. That's why this needs explicit CORS
// headers where nothing else here has needed them.
//
// Public, read-only, and returns nothing beyond a yes/no — no rate limiting
// or auth here, matching the low cost/risk of a single indexed lookup
// against a small table, unlike the paid-API-backed chat endpoints.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const business = (searchParams.get("business") || "").trim();

  if (!business) {
    return Response.json(
      { allowed: false, error: "Missing business parameter" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("badge_businesses")
      .select("id")
      .eq("business_name", business)
      .maybeSingle();

    if (error) throw error;

    return Response.json(
      { allowed: Boolean(data) },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("Badge business check failed:", err?.message || err);
    // Fails closed, unlike most of this app's other fallback behavior — an
    // unrecognized or erroring check should not accidentally let an
    // unapproved badge through.
    return Response.json(
      { allowed: false },
      { status: 200, headers: CORS_HEADERS }
    );
  }
}
