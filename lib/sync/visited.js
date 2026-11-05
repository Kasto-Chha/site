import { HUB_TOKEN_TTL_SECONDS, hubTokenConfigured, signHubToken, verifyHubToken } from "./hubToken";
import { getMerchantByTopicSlug } from "./merchants";
import { nepalDayStart } from "./time";

// The "Visited" label on a post, from the QR card to the post.
//
//   1. A person scans a business's QR card. The server gives their browser a cookie for THAT
//      business: signed, good for six hours, and unreadable by scripts on the page.
//   2. When they post an experience on that business's thread, the server looks for the cookie.
//      A good one, on a post that is the first of the day from that person on that thread, earns
//      the label (the post is stored with source = 'qr').
//
// What the label means: this person opened the business's QR link in the six hours before they
// posted. It is NOT proof they were there, because a link can be forwarded. It is limited to one
// labelled post per person per business per Nepal day, so one scan cannot label a run of posts.
//
// A cookie, not a link: nothing about it is in the web address, so sharing a page never shares
// the label, and a script on the page cannot read it. It is checked on the server, so the browser
// cannot ask for the label either.
//
// The label never blocks a post. Anything wrong (no secret, no cookie, a bad or expired one, a
// removed business, a database that cannot be read) just means no label, and the post goes through.
// Server-only: it reads the signing secret.

export const VISIT_COOKIE_PREFIX = "kc_v_";

// One cookie per business, so scanning two cafés never overwrites the first. A slug is letters,
// digits and hyphens, all of which a cookie name may contain.
export function visitCookieName(slug) {
  return `${VISIT_COOKIE_PREFIX}${slug}`;
}

export function readCookie(header, name) {
  for (const part of (header || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

// The Set-Cookie line to give someone who has just scanned this business's card, or null when no
// label can be offered (no secret configured: scanning still works, there is just no label).
export function visitCookieFor({ merchant, qr, secure = true, now = Date.now() }) {
  if (!hubTokenConfigured()) return null;
  try {
    const token = signHubToken({ merchantId: merchant.id, qrCodeId: qr.id, now });
    return `${visitCookieName(merchant.slug)}=${token}; Max-Age=${HUB_TOKEN_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  } catch {
    return null;
  }
}

// Does this post earn the label? Returns { merchantId, qrCodeId } if so, otherwise null.
// `slug` is the thread the post is going into; `userId` is who is posting.
export async function visitedCredit({ supabase, request, slug, userId, now = Date.now() }) {
  try {
    const header = request.headers.get("cookie") || "";
    // An ordinary post carries no such cookie: no lookup, no query, no cost at all.
    if (!header.includes(VISIT_COOKIE_PREFIX)) return null;
    if (!hubTokenConfigured()) return null;

    // The thread must belong to a business that is still tagged, and the cookie must be for it.
    const merchant = await getMerchantByTopicSlug(slug);
    if (!merchant) return null;
    const value = readCookie(header, visitCookieName(merchant.slug));
    if (!value) return null;
    const verified = verifyHubToken(value, { merchantId: merchant.id, now });
    if (!verified.ok) return null;

    // One labelled post per person per thread per Nepal day.
    const { data, error } = await supabase
      .from("reviews")
      .select("id")
      .eq("user_id", userId)
      .eq("topic_slug", slug)
      .eq("source", "qr")
      .gte("created_at", new Date(nepalDayStart(now)).toISOString())
      .limit(1);
    if (error || (data && data.length > 0)) return null;

    return { merchantId: merchant.id, qrCodeId: verified.qrCodeId };
  } catch {
    return null;
  }
}
