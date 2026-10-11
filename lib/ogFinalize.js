// Sends a share card to a link-preview bot (Facebook, Reddit, LinkedIn, X, WhatsApp...).
//
// The image engine streams its answer, so a bot sees no size up front and no clear
// cache lifetime. Some fetchers are fussier about that than others. This buffers the
// image and sends it as one complete file with its exact size, a plain image content
// type, and a day of caching. If the render fails for any reason, it serves the
// default image instead of an error: a bot given an error shows no preview at all.

export const CARD_CACHE_CONTROL = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";
export const DEFAULT_CARD_PATH = "/og-home.png";

export async function finalizeImage(response) {
  if (!response || !response.ok) throw new Error(`card render answered ${response?.status}`);
  const body = await response.arrayBuffer();
  if (body.byteLength === 0) throw new Error("card render produced an empty image");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(body.byteLength),
      "Cache-Control": CARD_CACHE_CONTROL
    }
  });
}

// The static default (public/og-home.png), fetched from this site; a short cache so
// the real card is tried again soon.
export async function defaultCardResponse(origin) {
  try {
    const res = await fetch(`${origin}${DEFAULT_CARD_PATH}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`default card answered ${res.status}`);
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "image/png", "Content-Length": String(body.byteLength), "Cache-Control": "public, max-age=300, s-maxage=300", "X-Share-Card": "default" }
    });
  } catch (error) {
    console.error("default share card unavailable:", error?.message || error);
    return new Response("share card unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
