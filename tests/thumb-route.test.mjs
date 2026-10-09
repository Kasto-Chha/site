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
