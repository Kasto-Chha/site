import crypto from "node:crypto";

// The token the QR hub hands out so that a post made from it can carry the "Visited"
// label. Signed with SYNC_HUB_SECRET, bound to one café, and short-lived.
//
// What it proves, and what it does not: it proves the person opened this café's QR
// link recently. It does not prove they were in the café, since anyone can forward
// the link. The short life (6 hours) limits how far a forwarded link goes, and a later
// patch limits Visited posts to one per person per café per day.
//
// It fails closed: with no secret, or a short one, no token can be made and every
// token is refused. Server-only (it uses node:crypto and a secret): never import this
// from a client component.

export const HUB_TOKEN_TTL_SECONDS = 6 * 60 * 60;
const MAX_TTL_SECONDS = 24 * 60 * 60;
const MIN_SECRET_LENGTH = 32;
const MAX_TOKEN_LENGTH = 400;

function secret() {
  const value = process.env.SYNC_HUB_SECRET || "";
  return value.length >= MIN_SECRET_LENGTH ? value : "";
}

export function hubTokenConfigured() {
  return Boolean(secret());
}

function signature(body, key) {
  return crypto.createHmac("sha256", key).update(`kc_hub:${body}`).digest("base64url");
}

export function signHubToken({ merchantId, qrCodeId = null, ttlSeconds = HUB_TOKEN_TTL_SECONDS, now = Date.now() } = {}) {
  const key = secret();
  if (!key) throw new Error("SYNC_HUB_SECRET is missing or shorter than 32 characters");
  if (!merchantId) throw new Error("signHubToken needs a merchantId");
  const ttl = Math.min(Math.max(1, Math.floor(ttlSeconds)), MAX_TTL_SECONDS);
  const payload = { m: String(merchantId), e: Math.floor(now / 1000) + ttl };
  if (qrCodeId) payload.q = String(qrCodeId);
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature(body, key)}`;
}

// merchantId is required: a token is only ever valid for the café it was made for,
// and a caller that forgets to say which café it is checking must not get a yes.
export function verifyHubToken(token, { merchantId, now = Date.now() } = {}) {
  const key = secret();
  if (!key) return { ok: false, reason: "not-configured" };
  if (!merchantId) return { ok: false, reason: "merchant-required" };
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: "malformed" };
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [body, given] = parts;

  const expected = Buffer.from(signature(body, key));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return { ok: false, reason: "bad-signature" };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const nowSeconds = Math.floor(now / 1000);
  if (!payload || typeof payload.m !== "string" || !Number.isFinite(payload.e)) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.e - nowSeconds > MAX_TTL_SECONDS) return { ok: false, reason: "malformed" };
  if (nowSeconds >= payload.e) return { ok: false, reason: "expired" };
  if (payload.m !== String(merchantId)) return { ok: false, reason: "wrong-merchant" };
  return { ok: true, merchantId: payload.m, qrCodeId: typeof payload.q === "string" ? payload.q : null, expiresAt: payload.e };
}
