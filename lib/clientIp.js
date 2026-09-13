// The calling client's IP, read only from the parts of the request a client
// cannot write for itself.
//
// This matters because the chat endpoint buckets anonymous callers by IP, and
// that bucket is the only ceiling a guest has once the trial cookie is cleared
// (which costs nothing). If the identifier is forgeable, the ceiling is
// decorative.
//
// X-Forwarded-For is a list, and a proxy APPENDS to it — it does not replace
// it. So in "10.0.0.5, 198.51.100.20" the first entry is whatever the caller
// chose to send and only the last was observed by our own edge. Reading the
// first entry (as this used to) let any caller mint a fresh rate-limit bucket
// per request just by incrementing a header.

// How many proxies of our own sit in front of the app. One (Vercel's edge) is
// the normal case, so the last entry is the one it added. Front the site with
// something else as well — Cloudflare, say — and this must grow to match, or
// every visitor is bucketed under the intermediate proxy's address and they
// all share one limit. Set too high it clamps to the leftmost entry, which is
// caller-written, so this wants to be exactly the number of hops.
function trustedProxyDepth() {
  const raw = Number.parseInt(process.env.TRUSTED_PROXY_DEPTH || "", 10);
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
}

export function clientIp(request) {
  // Vercel sets this itself and does not pass a client-supplied copy through,
  // so it is the trustworthy one when we're deployed there.
  const vercel = (request.headers.get("x-vercel-forwarded-for") || "").trim();
  if (vercel) return vercel.split(",").pop().trim();

  const forwarded = (request.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (forwarded.length) {
    // Count in from the right: the rightmost entries are the ones our own
    // proxies wrote, and everything left of them came from the caller.
    const index = forwarded.length - trustedProxyDepth();
    return forwarded[Math.max(0, index)];
  }

  // No forwarding header at all means nothing proxied this request — local
  // dev. Nothing to trust and nothing to protect, so take what's there.
  return (request.headers.get("x-real-ip") || "").trim() || "unknown";
}
