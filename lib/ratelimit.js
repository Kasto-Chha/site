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

// Named buckets, each with its own sliding window. Keyed per authenticated user
// (or, for chat, per client address when there is no account).
//
// The chat bucket is only the burst guard. The volume ceiling lives in
// lib/chatQuota.js, counted in Postgres, so it still applies when Upstash is
// absent and every check here passes — and it takes over the per-minute window
// too in that case, which is what the `skipped` flag below tells the caller.
const BUCKETS = {
  chat: { tokens: 10, window: "1 m" }, // costliest endpoint (drives Gemini)
  vote: { tokens: 30, window: "1 m" },
  write: { tokens: 10, window: "1 m" }, // reviews / questions / comments
  // Taps on a business's hub, per visitor address. Generous: a café's customers share one
  // Wi-Fi address, so one busy lunchtime must not lock them out.
  hub: { tokens: 120, window: "1 m" },
  // The website badge asking whether a business is on Sync, per visitor address. Answers are
  // also cached at the edge, so only a cache miss counts here.
  badge: { tokens: 120, window: "1 m" },
  // A private note sent from a business's hub, per visitor address. Twenty in five minutes: a person writes one note,
  // but a busy business's customers can share one Wi-Fi address, so the limit must be one that no honest crowd meets.
  // The daily cap per business (lib/sync/feedback.js) is what stops a flood.
  note: { tokens: 20, window: "5 m" }
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

// Is the limiter really limiting? Every check above quietly lets a request through when Upstash is not configured or
// cannot be reached, which is the right thing for a visitor and a silent failure for the team: the speed limits were
// off for an unknown time after the database behind them was deleted (found in testing, check F10). The Overview
// asks this and says so. `ping` and `env` are injectable so a test needs neither a network nor a real database.
export async function limiterStatus({ ping, timeoutMs = 1500, env = process.env } = {}) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url && !token) return { state: "missing", detail: "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not set in Vercel." };
  if (!url) return { state: "missing", detail: "UPSTASH_REDIS_REST_URL is not set in Vercel." };
  if (!token) return { state: "missing", detail: "UPSTASH_REDIS_REST_TOKEN is not set in Vercel." };
  const run = ping || (() => (redis ? redis.ping() : Promise.reject(new Error("no connection could be made"))));
  let timer;
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs);
      })
    ]);
    return { state: "on" };
  } catch (error) {
    // Short, and never anything but the service's own words: a wrong token says "WRONGPASS", a missing database says
    // "fetch failed". The settings themselves are never part of an error message.
    return { state: "unreachable", detail: `Upstash could not be reached (${String(error?.message || error).slice(0, 100)}).` };
  } finally {
    clearTimeout(timer);
  }
}
