// Shared rate limiter backed by Upstash Redis (the standard choice on Vercel
// serverless, where in-memory counters don't survive across lambda instances).
//
// Graceful degradation: if UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are
// not set, every check passes. That keeps the app working in dev and lets the
// limiter be deployed before the Upstash database is provisioned — turn it on by
// adding the two env vars.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const hasUpstash =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

const redis = hasUpstash ? Redis.fromEnv() : null;

// Named buckets, each with its own sliding window. Keyed per authenticated user.
// The chat bucket is only the burst guard — the volume ceiling for a signed-in
// account lives in lib/chatQuota.js, which counts stored messages and therefore
// still applies when Upstash is absent and every check here passes.
const BUCKETS = {
  chat: { tokens: 10, window: "1 m" }, // costliest endpoint (drives Gemini)
  vote: { tokens: 30, window: "1 m" },
  write: { tokens: 10, window: "1 m" } // reviews / questions / comments
};

const limiters = {};

function getLimiter(bucket) {
  if (!redis) return null;
  if (!limiters[bucket]) {
    const cfg = BUCKETS[bucket] || BUCKETS.write;
    limiters[bucket] = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(cfg.tokens, cfg.window),
      prefix: `rl:${bucket}`,
      analytics: false
    });
  }
  return limiters[bucket];
}

// Returns { ok: true } when allowed (or when Upstash isn't configured), or
// { ok: false, reset } when the identifier has exceeded the bucket.
export async function checkRateLimit(bucket, identifier) {
  const limiter = getLimiter(bucket);
  if (!limiter) return { ok: true, skipped: true };
  try {
    const { success, reset } = await limiter.limit(`${identifier || "anon"}`);
    return { ok: success, reset };
  } catch (error) {
    // Never let a limiter outage take down the endpoint — fail open.
    console.error("rate limit check failed:", error?.message || error);
    return { ok: true, skipped: true };
  }
}

// Seconds the client should wait before retrying, derived from the window reset.
export function retryAfterSeconds(reset) {
  if (!reset) return 60;
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000));
}
