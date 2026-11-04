import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../lib/supabase/server";
import { clientIp } from "../../../../lib/clientIp";
import { checkRateLimit, retryAfterSeconds } from "../../../../lib/ratelimit";
import { BODY_LIMITS, readJsonBody } from "../../../../lib/requestBody";
import { BADGE_EVENTS, PUBLIC_EVENTS, findQrByCode, isValidCode, logHubEvent, normalizeCode } from "../../../../lib/sync/qr";
import { getMerchantBySlug } from "../../../../lib/sync/merchants";

// A tap on the hub, or a click on the website badge, reported by the page. Public (a customer has no account), so it is limited
// per visitor address, takes only the few events the hub and the badge can report, and writes nothing about
// the person: an event is a count against a business, and optionally the table it came from.
//
// A reporting failure is never visible to the customer: the page has already moved on.
export async function POST(request) {
  const limit = await checkRateLimit("hub", clientIp(request));
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.reset)) } });
  }

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const { slug, code, type } = parsed.data || {};

  if (!PUBLIC_EVENTS.includes(type)) return NextResponse.json({ error: "Unknown event." }, { status: 400 });

  const merchant = await getMerchantBySlug(slug);
  if (!merchant) return NextResponse.json({ error: "Unknown business." }, { status: 404 });

  // The table it came from, only if that code really belongs to this business and is on.
  let qrCodeId = null;
  // (A badge click is not from a table, so it is never credited to one.)
  if (isValidCode(code) && !BADGE_EVENTS.includes(type)) {
    const found = await findQrByCode(createServerSupabase(), normalizeCode(code));
    if (found && found.merchant.id === merchant.id && found.qr.active) qrCodeId = found.qr.id;
  }

  await logHubEvent(createServerSupabase(), { merchantId: merchant.id, qrCodeId, type });
  return new Response(null, { status: 204 });
}
