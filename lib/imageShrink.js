// Shrinks a reel cover before it goes to the browser.
//
// The covers TikTok/Instagram/Facebook hand back are saved at a very high
// quality setting: one TikTok cover was 207 KiB for a picture the Reels rail
// shows at 150x201 px, and Lighthouse put ~190 KiB of that down to the
// encoding alone. Vercel's own image optimizer would normally fix this, but it
// is switched off for Reels (it burned through the monthly quota), so the
// thumbnail route does the work itself and the result is cached at the CDN for
// a day, which keeps the number of conversions small.
//
// Never lets a problem here break a thumbnail: anything unexpected returns
// null and the caller serves the original bytes, exactly as before.

const MAX_INPUT_BYTES = 5 * 1024 * 1024;
// The rail shows covers at ~150 px wide; 300 keeps them sharp on 2x screens.
export const THUMB_MAX_WIDTH = 300;
const WEBP_QUALITY = 72;

export async function shrinkThumbnail(input) {
  if (!input || input.length === 0 || input.length > MAX_INPUT_BYTES) return null;
  try {
    // Loaded lazily so a missing/failed native binary degrades to "serve the
    // original" instead of taking the whole route down at import time.
    const { default: sharp } = await import("sharp");
    return await sharp(input, { failOn: "none", limitInputPixels: 25_000_000 })
      .resize({ width: THUMB_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (error) {
    console.error("Thumbnail shrink failed, serving the original:", error?.message || error);
    return null;
  }
}
