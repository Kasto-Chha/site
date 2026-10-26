// Fonts and the logo for the share cards (lib/ogCards.js).
//
// Fetched from this site's own /public folder at request time: the image route
// runs on the edge, which has no filesystem, and bundling the files would count
// against the edge size limit. Kept for the life of the instance after the
// first request. If anything can't be fetched the caller gets null and draws the
// card with the built-in font and a text logo: a share card never fails because
// an asset didn't load.

const FONT_FILES = [
  { name: "DM Sans", weight: 400, file: "DMSans-Regular.ttf" },
  { name: "DM Sans", weight: 700, file: "DMSans-Bold.ttf" }
];
const FETCH_TIMEOUT_MS = 4000;

let fontsPromise = null;
let logoPromise = null;

export function resetOgAssetCache() {
  fontsPromise = null;
  logoPromise = null;
}

async function getBytes(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.arrayBuffer();
}

export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  // A thousand bytes at a time: handing tens of thousands of arguments to one call
  // can overflow the stack on a constrained server.
  const parts = [];
  for (let i = 0; i < bytes.length; i += 1024) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 1024)));
  }
  return btoa(parts.join(""));
}

export function loadOgFonts(origin) {
  if (!fontsPromise) {
    fontsPromise = Promise.all(
      FONT_FILES.map(async ({ name, weight, file }) => ({
        name,
        weight,
        style: "normal",
        data: await getBytes(`${origin}/fonts/${file}`)
      }))
    ).catch((error) => {
      // Not cached: the next request tries again.
      fontsPromise = null;
      console.error("Share-card fonts unavailable, using the default font:", error?.message || error);
      return null;
    });
  }
  return fontsPromise;
}

export function loadOgLogo(origin) {
  if (!logoPromise) {
    logoPromise = getBytes(`${origin}/kastochha-logo.svg`)
      .then((buffer) => `data:image/svg+xml;base64,${toBase64(buffer)}`)
      .catch((error) => {
        logoPromise = null;
        console.error("Share-card logo unavailable, using a text logo:", error?.message || error);
        return null;
      });
  }
  return logoPromise;
}
