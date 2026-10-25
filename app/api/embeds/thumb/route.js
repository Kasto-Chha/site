import { NextResponse } from "next/server";
import { shrinkThumbnail } from "../../../../lib/imageShrink";

export const runtime = "nodejs";

// Thumbnail resolver for Instagram/Facebook/TikTok reel links. Browsers can't
// load these covers directly (all three bot-check or redirect cross-site image
// requests), but they resolve fine server-side: Instagram serves a post's cover
// via its /media/ endpoint, Facebook serves og:image markup to its own
// link-preview crawler UA, and TikTok publishes a keyless oEmbed endpoint that
// returns a thumbnail_url. The resolved image is streamed back with long CDN
// caching so each thumbnail is fetched upstream rarely.
// YouTube never goes through here — its thumbnail URLs load directly.

const CRAWLER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
// Browser cache raised from 1 hour to 1 day: the bytes for a given reel rarely
// change, and Lighthouse flagged the short lifetime for returning visitors.
const CACHE_HIT = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";
const CACHE_MISS = "public, max-age=300";
// A platform having a bad moment (5xx, rate limit, timeout) shouldn't make a browser
// remember "no cover" for five minutes.
const CACHE_MISS_TRANSIENT = "public, max-age=30";
const FETCH_TIMEOUT_MS = 8000;

// Header-safe text: letters, digits and a few separators only.
function clean(text, max = 60) {
  return String(text ?? "").replace(/[^A-Za-z0-9 .:_/+-]/g, "_").trim().slice(0, max);
}

function describe(error) {
  const name = clean(error?.name || "Error", 24).replace(/[^A-Za-z0-9]/g, "") || "Error";
  const message = clean(error?.message, 40);
  return message ? `${name}:${message}` : name;
}

// Every miss says why in X-Thumb-Reason (e.g. "tiktok:oembed-503"), because the
// bare 404 gave no way to tell a blocked platform from a changed image host.
function miss(reason, transient = false) {
  return new NextResponse(null, {
    status: 404,
    headers: {
      "Cache-Control": transient ? CACHE_MISS_TRANSIENT : CACHE_MISS,
      "X-Thumb-Reason": clean(reason, 160)
    }
  });
}

const isTransientStatus = (status) => status >= 500 || status === 429;

function timeout() {
  return typeof AbortSignal !== "undefined" && AbortSignal.timeout
    ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
    : undefined;
}

// Only ever stream images that live on the CDNs these platforms serve covers
// from — the URL being followed comes from an upstream response, so this is
// what stops a crafted oEmbed/og:image payload turning the route into an open
// proxy for arbitrary hosts.
const IMAGE_HOST_SUFFIXES = [
  ".fbcdn.net",
  ".cdninstagram.com",
  ".tiktokcdn.com",
  ".tiktokcdn-us.com",
  ".tiktokcdn-eu.com",
  ".ttwstatic.com"
];

function isAllowedImageHost(hostname) {
  return IMAGE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

// -> { response } on success, or { reason, transient } explaining the miss.
async function streamImage(imageUrl, userAgent, label) {
  let res;
  try {
    res = await fetch(imageUrl, {
      redirect: "follow",
      headers: { "User-Agent": userAgent },
      signal: timeout()
    });
  } catch (error) {
    return { reason: `${label}:image-error:${describe(error)}`, transient: true };
  }
  if (!res.ok) return { reason: `${label}:image-${res.status}`, transient: isTransientStatus(res.status) };
  const type = res.headers.get("content-type") || "";
  if (!type.startsWith("image/")) return { reason: `${label}:not-image:${clean(type.split(";")[0], 30) || "none"}` };
  let finalHost;
  try {
    finalHost = new URL(res.url).hostname;
  } catch {
    return { reason: `${label}:bad-image-address` };
  }
  if (!isAllowedImageHost(finalHost)) return { reason: `${label}:host-not-allowed:${clean(finalHost)}` };

  // The host check above has to pass before a single byte is read. Then shrink
  // the cover (see lib/imageShrink.js). Keep whichever copy is smaller, and
  // fall back to the untouched original if shrinking fails or doesn't help.
  let original;
  try {
    original = Buffer.from(await res.arrayBuffer());
  } catch (error) {
    return { reason: `${label}:image-read:${describe(error)}`, transient: true };
  }
  let shrunk = null;
  try {
    shrunk = await shrinkThumbnail(original);
  } catch {
    shrunk = null;
  }
  const useShrunk = shrunk && shrunk.length < original.length;
  return {
    response: new NextResponse(useShrunk ? shrunk : original, {
      headers: {
        "Content-Type": useShrunk ? "image/webp" : type,
        "Cache-Control": CACHE_HIT
      }
    })
  };
}

function extractOgImage(html) {
  const m =
    html.match(/property="og:image"[^>]*content="([^"]+)"/) ||
    html.match(/content="([^"]+)"[^>]*property="og:image"/);
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

// -> { url } of the page's og:image, or { reason, transient }.
async function fetchOgImage(pageUrl, label) {
  let page;
  try {
    page = await fetch(pageUrl, {
      redirect: "follow",
      headers: { "User-Agent": CRAWLER_UA, "Accept-Language": "en" },
      signal: timeout()
    });
  } catch (error) {
    return { reason: `${label}:page-error:${describe(error)}`, transient: true };
  }
  if (!page.ok) return { reason: `${label}:page-${page.status}`, transient: isTransientStatus(page.status) };
  const og = extractOgImage(await page.text().catch(() => ""));
  if (!og) return { reason: `${label}:no-og-image` };
  let ogUrl;
  try {
    ogUrl = new URL(og);
  } catch {
    return { reason: `${label}:bad-og-image` };
  }
  if (ogUrl.protocol !== "https:") return { reason: `${label}:og-not-https` };
  if (!isAllowedImageHost(ogUrl.hostname)) return { reason: `${label}:host-not-allowed:${clean(ogUrl.hostname)}` };
  return { url: ogUrl.toString() };
}

const fail = (result) => miss(result.reason, result.transient);

export async function GET(request) {
  const raw = new URL(request.url).searchParams.get("url") || "";

  let target;
  try {
    target = new URL(raw);
  } catch {
    return miss("bad-url");
  }
  if (target.protocol !== "https:") return miss("not-https");

  const host = target.hostname.replace(/^(www|m)\./, "");

  try {
    if (host === "instagram.com") {
      const m = target.pathname.match(/\/(reel|reels|p|tv)\/([^/]+)/);
      if (!m) return miss("instagram:no-id");
      const kind = m[1] === "reels" ? "reel" : m[1];
      const media = `https://www.instagram.com/${kind}/${encodeURIComponent(m[2])}/media/?size=l`;
      const result = await streamImage(media, BROWSER_UA, "instagram");
      return result.response || fail(result);
    }

    // TikTok: keyless oEmbed, works for /video/<id> links and for the short
    // vm./vt. share links people actually copy out of the app.
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      let oembed;
      try {
        oembed = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(target.toString())}`, {
          redirect: "follow",
          headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
          signal: timeout()
        });
      } catch (error) {
        return miss(`tiktok:oembed-error:${describe(error)}`, true);
      }
      if (!oembed.ok) return miss(`tiktok:oembed-${oembed.status}`, isTransientStatus(oembed.status));
      const data = await oembed.json().catch(() => null);
      if (!data) return miss("tiktok:oembed-bad-json");
      const thumb = data.thumbnail_url;
      if (!thumb) return miss("tiktok:no-thumbnail");
      let thumbUrl;
      try {
        thumbUrl = new URL(thumb);
      } catch {
        return miss("tiktok:bad-thumbnail");
      }
      if (thumbUrl.protocol !== "https:") return miss("tiktok:thumbnail-not-https");
      if (!isAllowedImageHost(thumbUrl.hostname)) return miss(`tiktok:host-not-allowed:${clean(thumbUrl.hostname)}`);
      const result = await streamImage(thumbUrl.toString(), BROWSER_UA, "tiktok");
      return result.response || fail(result);
    }

    if (host === "facebook.com" || host === "fb.watch") {
      const og = await fetchOgImage(target.toString(), "facebook");
      if (!og.url) return fail(og);
      const result = await streamImage(og.url, CRAWLER_UA, "facebook");
      return result.response || fail(result);
    }

    return miss(`unsupported-host:${clean(host, 40)}`);
  } catch (error) {
    // Anything unforeseen: a cached, explained miss rather than a crash.
    return miss(`error:${describe(error)}`, true);
  }
}
