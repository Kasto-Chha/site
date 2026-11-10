import { clientIp } from "../../../../lib/clientIp";
import { checkRateLimit, retryAfterSeconds } from "../../../../lib/ratelimit";
import { badgeCheckAnswer } from "../../../../lib/sync/badge";
import { getMerchantBySlug } from "../../../../lib/sync/merchants";
import { isValidSlug, normalizeSlug } from "../../../../lib/sync/slug";

// Called by the website badge (public/badge-widget.js) from whatever site it is pasted on, so
// it is genuinely cross-origin and needs CORS headers where nothing else here has.
//
// It answers one question: is this business on KastoChha Sync right now? The business is named
// by its Sync address (its slug), and the answer is yes only while it is tagged and active. So a
// business that is removed loses its badge without anyone touching the site it sits on. A yes
// carries only what is already public on the business's own page: its name and where its thread is.
//
// Public and read-only, so it is limited per visitor address, and the answer is cached at the edge
// for a minute: a busy site's visitors are answered from the cache instead of the database, and a
// removed business's badge is gone within a minute. It fails closed: any trouble means no badge.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export const dynamic = "force-dynamic";
// Reading the database must always be fresh; the one-minute memory this route wants is set in its response headers below.
export const fetchCache = "force-no-store";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request) {
  const limit = await checkRateLimit("badge", clientIp(request));
  if (!limit.ok) {
    return Response.json(
      { allowed: false, error: "Too many requests." },
      { status: 429, headers: { ...CORS_HEADERS, "Retry-After": String(retryAfterSeconds(limit.reset)), "Cache-Control": "no-store" } }
    );
  }

  const business = normalizeSlug(new URL(request.url).searchParams.get("business"));
  if (!business) {
    return Response.json({ allowed: false, error: "Missing business parameter" }, { status: 400, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
  }
  // Not an address: not a business. No lookup, and no answer worth keeping for long.
  if (!isValidSlug(business)) {
    return Response.json({ allowed: false }, { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=0, s-maxage=30" } });
  }

  const merchant = await getMerchantBySlug(business);
  const answer = badgeCheckAnswer(merchant);
  return Response.json(answer, {
    headers: { ...CORS_HEADERS, "Cache-Control": `public, max-age=0, s-maxage=${answer.allowed ? 60 : 30}` }
  });
}
