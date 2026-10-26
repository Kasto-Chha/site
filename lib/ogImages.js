// Pictures for the Battle share card. They arrive as addresses in the card's URL,
// which anyone can type, so nothing is fetched unless it follows the same rules the
// rest of the site applies to images:
//   - a path on this site ("/images/x.jpg"), or
//   - https on this project's Supabase storage, or on a host the site already
//     approves for images (the OPTIMIZED_IMAGE_HOSTS list from next.config.js).
// The image engine can draw JPEG, PNG and GIF; WebP, AVIF and TIFF crash it, so
// those are refused rather than attempted.
//
// Every decision comes back with a short reason, and the card reports both sides'
// reasons in an X-Card-Pictures header. A picture that isn't used therefore says
// why, instead of quietly turning into the battle's colour.

import { toBase64 } from "./ogAssets";

const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 4000;

export function supabaseOrigin() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  try {
    return base ? new URL(base).origin : null;
  } catch {
    return null;
  }
}

function approvedHosts() {
  const hosts = new Set();
  const supabase = supabaseOrigin();
  if (supabase) hosts.add(new URL(supabase).hostname.toLowerCase());
  for (const entry of (process.env.OPTIMIZED_IMAGE_HOSTS || "").split(",")) {
    const host = entry.trim().toLowerCase();
    if (host) hosts.add(host);
  }
  return hosts;
}

// -> { url } to fetch, or { reason } explaining the refusal.
export function resolveBattlePicture(raw, siteOrigin) {
  const text = String(raw ?? "").trim();
  if (!text) return { reason: "none" };
  if (text.startsWith("/") && !text.startsWith("//")) {
    // Our own file, e.g. /battle-images/x.jpg.
    try {
      return siteOrigin ? { url: new URL(text, siteOrigin).toString() } : { reason: "no-site-origin" };
    } catch {
      return { reason: "invalid-address" };
    }
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    return { reason: "invalid-address" };
  }
  if (url.protocol !== "https:") return { reason: "not-https" };
  const hosts = approvedHosts();
  if (hosts.size === 0) return { reason: "no-approved-hosts" };
  if (!hosts.has(url.hostname.toLowerCase())) return { reason: "host-not-approved" };
  const isSupabase = supabaseOrigin() && url.origin === supabaseOrigin();
  if (isSupabase && !url.pathname.startsWith("/storage/v1/")) return { reason: "path-not-storage" };
  return { url: url.toString() };
}

export function sniffImageType(bytes) {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  return null;
}

// Names a format we refuse, so the reason says "webp" rather than just "unsupported".
function describeOther(bytes) {
  const ascii = (from, to) => String.fromCharCode.apply(null, bytes.subarray(from, to));
  if (bytes.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (bytes.length > 12 && ascii(4, 8) === "ftyp" && /avif|avis/.test(ascii(8, 16))) return "avif";
  if (bytes.length > 4 && (ascii(0, 2) === "II" || ascii(0, 2) === "MM")) return "tiff";
  if (bytes.length > 2 && ascii(0, 2) === "BM") return "bmp";
  return "unknown";
}

// A short, header-safe description of an error, so a failure explains itself.
function describe(error) {
  const name = String(error?.name || "Error").replace(/[^A-Za-z0-9]/g, "").slice(0, 24) || "Error";
  const message = String(error?.message || "").replace(/[^A-Za-z0-9 .:_-]/g, "_").trim().slice(0, 40);
  return message ? `${name}:${message}` : name;
}

function failed(stage, error) {
  console.error(`Battle picture failed (${stage}):`, error);
  return { image: null, reason: `fetch-error:${stage}:${describe(error)}` };
}

// -> { image: a data: URI or null, reason: "ok" or why not }
// The request is a plain fetch (redirects are followed, then the final address is
// checked against the same rules). Failures say which step broke: request, read
// or encode.
export async function loadBattleImage(raw, siteOrigin) {
  const target = resolveBattlePicture(raw, siteOrigin);
  if (!target.url) return { image: null, reason: target.reason };

  let res;
  try {
    res = await fetch(target.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    return error?.name === "TimeoutError" ? { image: null, reason: "fetch-timeout" } : failed("request", error);
  }
  if (!res.ok) return { image: null, reason: `fetch-failed:${res.status}` };
  if (res.redirected && res.url && !resolveBattlePicture(res.url, siteOrigin).url) return { image: null, reason: "redirected-elsewhere" };
  if (Number(res.headers?.get?.("content-length") || 0) > MAX_BYTES) return { image: null, reason: "too-large" };

  let buffer;
  try {
    buffer = await res.arrayBuffer();
  } catch (error) {
    return error?.name === "TimeoutError" ? { image: null, reason: "fetch-timeout" } : failed("read", error);
  }
  if (buffer.byteLength > MAX_BYTES) return { image: null, reason: "too-large" };

  try {
    const bytes = new Uint8Array(buffer);
    const type = sniffImageType(bytes);
    if (!type) return { image: null, reason: `unsupported-format:${describeOther(bytes)}` };
    return { image: `data:${type};base64,${toBase64(buffer)}`, reason: "ok" };
  } catch (error) {
    return failed("encode", error);
  }
}
