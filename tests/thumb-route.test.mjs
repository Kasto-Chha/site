// /api/embeds/thumb — the Reels cover proxy. These run the real route and the
// real image library; only the upstream sites (TikTok's oEmbed + its image CDN)
// are faked. What matters: covers come back small, a bad image never turns into
// a broken one, and the host allowlist still holds.

import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

const { GET } = await import("../app/api/embeds/thumb/route.js");
const { shrinkThumbnail } = await import("../lib/imageShrink.js");

// A photo-like cover saved at the very high quality the platforms use: smooth
// gradients plus grain, which is what makes real covers heavy.
async function makeCover(width = 243, height = 433, quality = 95) {
  const raw = Buffer.alloc(width * height * 3);
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = clamp((x / width) * 200 + rnd() * 40);
      raw[i + 1] = clamp((y / height) * 200 + rnd() * 40);
      raw[i + 2] = clamp(120 + rnd() * 60);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality }).toBuffer();
}

const realFetch = globalThis.fetch;
const realConsoleError = console.error;

function fakeUpstream(imageBytes, { imageType = "image/jpeg", imageHost = "p16-sign.tiktokcdn.com" } = {}) {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://www.tiktok.com/oembed")) {
      return new Response(JSON.stringify({ thumbnail_url: `https://${imageHost}/cover.jpg` }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (url.startsWith(`https://${imageHost}/`)) {
      const res = new Response(imageBytes, { status: 200, headers: { "content-type": imageType } });
      // A hand-built Response has no .url; the route checks where the bytes
      // really came from.
      Object.defineProperty(res, "url", { value: url });
      return res;
    }
    throw new Error(`unexpected fetch ${url}`);
  };
}

function restore() {
  globalThis.fetch = realFetch;
  console.error = realConsoleError;
}

async function callRoute() {
  const target = encodeURIComponent("https://www.tiktok.com/@kasto/video/123");
  return GET(new Request(`https://kastochhanepal.com/api/embeds/thumb?url=${target}`));
}

test("a heavy cover comes back as a much smaller WebP, no wider than 300px", async (t) => {
  const original = await makeCover();
  fakeUpstream(original);
  try {
    const res = await callRoute();
    const body = Buffer.from(await res.arrayBuffer());
    t.diagnostic(`original ${original.length} bytes -> served ${body.length} bytes`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/webp");
    assert.ok(body.length < original.length * 0.6, `expected well under 60% of ${original.length}, got ${body.length}`);
    const meta = await sharp(body).metadata();
    assert.equal(meta.format, "webp");
    assert.ok(meta.width <= 300, `width ${meta.width}`);
    assert.ok(meta.width > 0 && meta.height > 0);
  } finally {
    restore();
  }
});

test("browsers may keep a cover for a day; the CDN too", async () => {
  fakeUpstream(await makeCover());
  try {
    const res = await callRoute();
    const cache = res.headers.get("cache-control");
    assert.match(cache, /max-age=86400/);
    assert.match(cache, /s-maxage=86400/);
  } finally {
    restore();
  }
});

test("bytes that can't be decoded are served untouched, not broken", async () => {
  const junk = Buffer.from("this is not really a jpeg, but the upstream says it is");
  fakeUpstream(junk);
  console.error = () => {}; // the shrink step logs why it gave up
  try {
    const res = await callRoute();
    const body = Buffer.from(await res.arrayBuffer());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/jpeg");
    assert.deepEqual(body, junk);
  } finally {
    restore();
  }
});

test("an image that is already tiny is never made bigger", async () => {
  const tiny = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#c8102e" } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  fakeUpstream(tiny, { imageType: "image/png" });
  try {
    const res = await callRoute();
    const body = Buffer.from(await res.arrayBuffer());
    assert.equal(res.status, 200);
    assert.ok(body.length <= tiny.length, `served ${body.length} > original ${tiny.length}`);
    assert.ok((await sharp(body).metadata()).width === 8);
  } finally {
    restore();
  }
});

test("images from outside the CDN allowlist are still refused", async () => {
  fakeUpstream(await makeCover(), { imageHost: "evil.example.com" });
  try {
    const res = await callRoute();
    assert.equal(res.status, 404);
  } finally {
    restore();
  }
});

test("shrinkThumbnail gives up cleanly on empty, missing, or oversized input", async () => {
  assert.equal(await shrinkThumbnail(null), null);
  assert.equal(await shrinkThumbnail(Buffer.alloc(0)), null);
  assert.equal(await shrinkThumbnail(Buffer.alloc(5 * 1024 * 1024 + 1)), null);
});

// ---------- why a cover is missing: every miss explains itself ----------

function upstream(table) {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    for (const [prefix, respond] of table) if (url.startsWith(prefix)) return respond(url, init);
    throw new Error(`unexpected fetch ${url}`);
  };
}
function imageResponse(url, bytes, type = "image/jpeg") {
  const res = new Response(bytes, { status: 200, headers: { "content-type": type } });
  Object.defineProperty(res, "url", { value: url });
  return res;
}
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ask = (link) => GET(new Request(`https://kastochhanepal.com/api/embeds/thumb?url=${encodeURIComponent(link)}`));
const TIKTOK = "https://www.tiktok.com/@kasto/video/123";
const OEMBED = "https://www.tiktok.com/oembed";

async function expectMiss(res, reason, { transient = false } = {}) {
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("x-thumb-reason"), reason);
  assert.equal(res.headers.get("cache-control"), transient ? "public, max-age=30" : "public, max-age=300");
}

test("TikTok: each way it can fail says so, and only temporary ones are remembered briefly", async () => {
  console.error = () => {};
  try {
    const cover = await makeCover();
    const goodOembed = () => jsonResponse({ thumbnail_url: "https://p16-sign.tiktokcdn.com/cover.jpg" });
    const image = (url) => imageResponse(url, cover);
    const cases = [
      ["the lookup is overloaded (503)", [[OEMBED, () => new Response("busy", { status: 503 })]], "tiktok:oembed-503", true],
      ["the lookup is rate-limited (429)", [[OEMBED, () => new Response("slow down", { status: 429 })]], "tiktok:oembed-429", true],
      ["the lookup says not found (404)", [[OEMBED, () => new Response("no", { status: 404 })]], "tiktok:oembed-404", false],
      ["the lookup returns something that isn't JSON", [[OEMBED, () => new Response("<html>", { status: 200 })]], "tiktok:oembed-bad-json", false],
      ["the lookup has no cover in it", [[OEMBED, () => jsonResponse({})]], "tiktok:no-thumbnail", false],
      ["the cover is on a host we don't approve", [[OEMBED, () => jsonResponse({ thumbnail_url: "https://evil.example.com/c.jpg" })]], "tiktok:host-not-allowed:evil.example.com", false],
      ["the cover is not https", [[OEMBED, () => jsonResponse({ thumbnail_url: "http://p16-sign.tiktokcdn.com/c.jpg" })]], "tiktok:thumbnail-not-https", false],
      ["the image is refused (403)", [[OEMBED, goodOembed], ["https://p16-sign.tiktokcdn.com/", () => new Response("no", { status: 403 })]], "tiktok:image-403", false],
      ["the image server is down (502)", [[OEMBED, goodOembed], ["https://p16-sign.tiktokcdn.com/", () => new Response("bad gateway", { status: 502 })]], "tiktok:image-502", true],
      ["the 'image' is really a web page", [[OEMBED, goodOembed], ["https://p16-sign.tiktokcdn.com/", (url) => imageResponse(url, "<html>login</html>", "text/html; charset=utf-8")]], "tiktok:not-image:text/html", false],
      ["the image redirects to a host we don't approve", [[OEMBED, goodOembed], ["https://p16-sign.tiktokcdn.com/", () => imageResponse("https://evil.example.com/c.jpg", cover)]], "tiktok:host-not-allowed:evil.example.com", false],
      ["the lookup can't be reached at all", [[OEMBED, () => { throw new TypeError("fetch failed"); }]], "tiktok:oembed-error:TypeError:fetch failed", true],
      ["the image can't be reached at all", [[OEMBED, goodOembed], ["https://p16-sign.tiktokcdn.com/", () => { throw new TypeError("fetch failed"); }]], "tiktok:image-error:TypeError:fetch failed", true]
    ];
    for (const [name, table, reason, transient] of cases) {
      upstream(table);
      await expectMiss(await ask(TIKTOK), reason, { transient }).catch((error) => {
        error.message = `${name}: ${error.message}`;
        throw error;
      });
    }
    // and a working cover carries no reason and the long cache
    upstream([[OEMBED, goodOembed], ["https://p16-sign.tiktokcdn.com/", image]]);
    const ok = await ask(TIKTOK);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("x-thumb-reason"), null);
    assert.match(ok.headers.get("cache-control"), /max-age=86400/);
  } finally {
    restore();
  }
});

test("Instagram: one direct attempt, and each way it can fail says so", async () => {
  const cover = await makeCover();
  const REEL = "https://www.instagram.com/reel/ABC123/";
  const MEDIA = "https://www.instagram.com/reel/ABC123/media/";
  const asked = [];
  const track = (fn) => (url, init) => {
    asked.push(url);
    return fn(url, init);
  };
  try {
    // the cover is served; nothing else is fetched
    upstream([[MEDIA, track((url) => imageResponse("https://scontent.cdninstagram.com/c.jpg", cover))]]);
    const ok = await ask(REEL);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("x-thumb-reason"), null);
    assert.deepEqual(asked, [`${MEDIA}?size=l`]);

    // refused, or answered with a login page, or rate limited, or down
    upstream([[MEDIA, () => new Response("login", { status: 403 })]]);
    await expectMiss(await ask(REEL), "instagram:image-403");
    upstream([[MEDIA, (url) => imageResponse(url, "<html>login</html>", "text/html")]]);
    await expectMiss(await ask(REEL), "instagram:not-image:text/html");
    upstream([[MEDIA, () => new Response("slow", { status: 429 })]]);
    await expectMiss(await ask(REEL), "instagram:image-429", { transient: true });
    upstream([[MEDIA, () => new Response("down", { status: 503 })]]);
    await expectMiss(await ask(REEL), "instagram:image-503", { transient: true });
    upstream([[MEDIA, () => { throw new TypeError("fetch failed"); }]]);
    await expectMiss(await ask(REEL), "instagram:image-error:TypeError:fetch failed", { transient: true });

    // the image ends up on a host we don't approve
    upstream([[MEDIA, () => imageResponse("https://evil.example.com/c.jpg", cover)]]);
    await expectMiss(await ask(REEL), "instagram:host-not-allowed:evil.example.com");

    // not a reel or post address at all
    await expectMiss(await ask("https://www.instagram.com/someaccount/"), "instagram:no-id");
  } finally {
    restore();
  }
});

test("Facebook: a missing or foreign og:image is reported, not hidden", async () => {
  const cover = await makeCover();
  const FB = "https://www.facebook.com/reel/123";
  const page = (html, status = 200) => new Response(html, { status });
  try {
    upstream([[FB, () => page(`<meta property="og:image" content="https://scontent.fbcdn.net/c.jpg">`)], ["https://scontent.fbcdn.net/", (url) => imageResponse(url, cover)]]);
    assert.equal((await ask(FB)).status, 200);
    upstream([[FB, () => page("<html>log in to continue</html>")]]);
    await expectMiss(await ask(FB), "facebook:no-og-image");
    upstream([[FB, () => page("denied", 403)]]);
    await expectMiss(await ask(FB), "facebook:page-403");
    upstream([[FB, () => page("down", 503)]]);
    await expectMiss(await ask(FB), "facebook:page-503", { transient: true });
    upstream([[FB, () => page(`<meta property="og:image" content="https://evil.example.com/c.jpg">`)]]);
    await expectMiss(await ask(FB), "facebook:host-not-allowed:evil.example.com");
  } finally {
    restore();
  }
});

test("bad, insecure and unsupported addresses each say so; reasons stay short and header-safe", async () => {
  try {
    upstream([]);
    await expectMiss(await ask("not a url"), "bad-url");
    await expectMiss(await ask("http://www.tiktok.com/@a/video/1"), "not-https");
    await expectMiss(await ask("https://example.com/video/1"), "unsupported-host:example.com");
    const long = await ask(`https://${"a".repeat(120)}.example.com/x`);
    assert.equal(long.status, 404);
    assert.ok(long.headers.get("x-thumb-reason").length <= 160);
    assert.match(long.headers.get("x-thumb-reason"), /^unsupported-host:a+$/);
    assert.doesNotMatch(long.headers.get("x-thumb-reason"), /[^A-Za-z0-9 .:_/+-]/);
  } finally {
    restore();
  }
});
