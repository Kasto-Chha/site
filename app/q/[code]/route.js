import { createServerSupabase } from "../../../lib/supabase/server";
import { SCAN_COOKIE, SCAN_COOKIE_SECONDS, findQrByCode, isBot, isValidCode, logHubEvent, normalizeCode } from "../../../lib/sync/qr";

export const dynamic = "force-dynamic";

function cookieValue(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

// A printed QR code lands here. It counts the scan, then sends the customer to the business's
// hub. The destination is built from the business's own address in the database, never from
// anything in the request, so this can only ever lead to a hub. Counting never delays or
// blocks the customer: if it fails, they still arrive.
//
// 302, not 301: a code can be switched off or pointed elsewhere, and browsers must not remember it.
export async function GET(request, { params }) {
  const go = (location, headers = {}) =>
    new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store", ...headers } });

  const code = normalizeCode(params.code);
  if (!isValidCode(code)) return go("/");

  let supabase;
  try {
    supabase = createServerSupabase();
  } catch {
    return go("/");
  }

  const found = await findQrByCode(supabase, code);
  // An unknown code, a code that has been switched off, or a business whose tag was removed.
  if (!found || !found.qr.active || found.merchant.status !== "active") return go("/");

  const destination = `/hub/${found.merchant.slug}?c=${code}`;

  // Once per person per ten minutes, and never a link preview, a crawler or a script.
  const alreadyCounted = cookieValue(request, SCAN_COOKIE) === code;
  if (alreadyCounted || isBot(request.headers.get("user-agent"))) return go(destination);

  await logHubEvent(supabase, { merchantId: found.merchant.id, qrCodeId: found.qr.id, type: "scan" });
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return go(destination, { "Set-Cookie": `${SCAN_COOKIE}=${code}; Max-Age=${SCAN_COOKIE_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}` });
}
