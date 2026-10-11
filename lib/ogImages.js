// Pictures for the Battle share card. They arrive as addresses in the card's
// URL, which anyone can type, so nothing is fetched unless it points at this
// site's own Supabase public storage. The image engine can't read WebP, so only
// JPEG and PNG are used; anything else, or any failure, returns null and the
// card falls back to the battle's colour, as the Battle page itself does.

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

export function allowedImageUrl(raw, origin = supabaseOrigin()) {
  if (!raw || !origin) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.origin !== origin) return null;
    if (!url.pathname.startsWith("/storage/v1/object/public/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function sniffImageType(bytes) {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export async function loadBattleImage(raw) {
  const url = allowedImageUrl(raw);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "error" });
    if (!res.ok) return null;
    if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return null;
    const type = sniffImageType(new Uint8Array(buffer));
    return type ? `data:${type};base64,${toBase64(buffer)}` : null;
  } catch {
    return null;
  }
}
