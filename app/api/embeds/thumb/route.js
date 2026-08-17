import { NextResponse } from "next/server";

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
const CACHE_HIT = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
const CACHE_MISS = "public, max-age=300";
const FETCH_TIMEOUT_MS = 8000;

function miss() {
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": CACHE_MISS } });
}

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

async function streamImage(imageUrl, userAgent) {
  const res = await fetch(imageUrl, {
    redirect: "follow",
    headers: { "User-Agent": userAgent },
    signal: timeout()
  });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || !type.startsWith("image/")) return null;
  try {
    if (!isAllowedImageHost(new URL(res.url).hostname)) return null;
  } catch {
    return null;
  }
  return new NextResponse(res.body, {
    headers: { "Content-Type": type, "Cache-Control": CACHE_HIT }
  });
}

function extractOgImage(html) {
  const m =
    html.match(/property="og:image"[^>]*content="([^"]+)"/) ||
    html.match(/content="([^"]+)"[^>]*property="og:image"/);
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

export async function GET(request) {
  const raw = new URL(request.url).searchParams.get("url") || "";

  let target;
  try {
    target = new URL(raw);
  } catch {
    return miss();
  }
  if (target.protocol !== "https:") return miss();

  const host = target.hostname.replace(/^(www|m)\./, "");

  try {
    if (host === "instagram.com") {
      const m = target.pathname.match(/\/(reel|reels|p|tv)\/([^/]+)/);
      if (!m) return miss();
      const kind = m[1] === "reels" ? "reel" : m[1];
      const media = `https://www.instagram.com/${kind}/${encodeURIComponent(m[2])}/media/?size=l`;
      return (await streamImage(media, BROWSER_UA)) || miss();
    }

    // TikTok: keyless oEmbed, works for /video/<id> links and for the short
    // vm./vt. share links people actually copy out of the app.
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      const oembed = await fetch(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(target.toString())}`,
        {
          redirect: "follow",
          headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
          signal: timeout()
        }
      );
      if (!oembed.ok) return miss();
      const data = await oembed.json().catch(() => null);
      const thumb = data?.thumbnail_url;
      if (!thumb) return miss();
      let thumbUrl;
      try {
        thumbUrl = new URL(thumb);
      } catch {
        return miss();
      }
      if (thumbUrl.protocol !== "https:" || !isAllowedImageHost(thumbUrl.hostname)) {
        return miss();
      }
      return (await streamImage(thumbUrl.toString(), BROWSER_UA)) || miss();
    }

    if (host === "facebook.com" || host === "fb.watch") {
      const page = await fetch(target.toString(), {
        redirect: "follow",
        headers: { "User-Agent": CRAWLER_UA, "Accept-Language": "en" },
        signal: timeout()
      });
      if (!page.ok) return miss();
      const og = extractOgImage(await page.text());
      if (!og) return miss();
      let ogUrl;
      try {
        ogUrl = new URL(og);
      } catch {
        return miss();
      }
      if (ogUrl.protocol !== "https:" || !isAllowedImageHost(ogUrl.hostname)) return miss();
      return (await streamImage(ogUrl.toString(), CRAWLER_UA)) || miss();
    }
  } catch {
    // Upstream flaked or timed out — fall through to a cached miss.
  }

  return miss();
}
