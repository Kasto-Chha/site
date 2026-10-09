// Which image URLs next/image may send through the optimizer.
//
// The optimizer is our server fetching a URL and re-encoding what comes back,
// and /_next/image?url=... takes that URL from whoever calls it — not only
// from our own pages. So next.config.js lists the approved hosts, and this
// mirrors the same list (inlined at build as OPTIMIZED_IMAGE_HOSTS) so that
// <RemoteImage> knows which sources it may hand to the optimizer. Anything
// else still displays, loaded by the browser straight from its host.

const HOSTS = (process.env.OPTIMIZED_IMAGE_HOSTS || "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

export function canOptimizeImage(src) {
  if (typeof src !== "string" || !src) return false;
  // Our own paths, e.g. the /api/embeds/thumb proxy.
  if (src.startsWith("/")) return !src.startsWith("//");
  try {
    const url = new URL(src);
    return url.protocol === "https:" && HOSTS.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
