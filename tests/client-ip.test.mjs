// lib/clientIp.js — the identifier the chat burst limiter buckets guests by.
// A caller who can steer this can hand themselves an unlimited number of
// buckets, so every case here is about ignoring caller-written input.

import test from "node:test";
import assert from "node:assert/strict";

const { clientIp } = await import("../lib/clientIp.js");

function req(headers) {
  return new Request("https://kastochha.com/api/chat", { headers });
}

test("takes the entry our own proxy appended, not the caller's", () => {
  assert.equal(
    clientIp(req({ "x-forwarded-for": "10.0.0.99, 198.51.100.20" })),
    "198.51.100.20"
  );
  assert.equal(
    clientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3, 198.51.100.20" })),
    "198.51.100.20"
  );
});

test("a single-entry header is the real client", () => {
  assert.equal(clientIp(req({ "x-forwarded-for": "198.51.100.20" })), "198.51.100.20");
});

test("rotating the caller-written end never changes the answer", () => {
  const seen = new Set();
  for (let i = 0; i < 100; i += 1) {
    seen.add(clientIp(req({ "x-forwarded-for": `10.0.0.${i}, 198.51.100.20` })));
  }
  assert.deepEqual([...seen], ["198.51.100.20"]);
});

test("x-vercel-forwarded-for wins, because the platform sets it", () => {
  assert.equal(
    clientIp(
      req({
        "x-vercel-forwarded-for": "198.51.100.20",
        "x-forwarded-for": "10.0.0.99",
        "x-real-ip": "10.0.0.98"
      })
    ),
    "198.51.100.20"
  );
});

test("a forged x-real-ip cannot override a forwarding header", () => {
  assert.equal(
    clientIp(req({ "x-forwarded-for": "198.51.100.20", "x-real-ip": "10.0.0.99" })),
    "198.51.100.20"
  );
});

test("TRUSTED_PROXY_DEPTH counts further in from the right", () => {
  process.env.TRUSTED_PROXY_DEPTH = "2";
  try {
    assert.equal(
      clientIp(req({ "x-forwarded-for": "203.0.113.5, 198.51.100.20, 198.51.100.21" })),
      "198.51.100.20"
    );
    // Fewer entries than the configured depth must clamp, not go undefined —
    // an undefined identifier would bucket every such caller together.
    assert.equal(clientIp(req({ "x-forwarded-for": "203.0.113.5" })), "203.0.113.5");
  } finally {
    delete process.env.TRUSTED_PROXY_DEPTH;
  }
});

test("padding, empty entries and a missing header all degrade safely", () => {
  assert.equal(clientIp(req({ "x-forwarded-for": "  ,  , 198.51.100.20  " })), "198.51.100.20");
  assert.equal(clientIp(req({ "x-forwarded-for": "   " })), "unknown");
  assert.equal(clientIp(req({})), "unknown");
});
