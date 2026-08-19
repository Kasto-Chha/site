// Per-user volume limits for the AI assistant, counted straight out of
// chat_messages.
//
// Why not Upstash: the sliding-window limiter in lib/ratelimit.js degrades to
// "allow everything" when UPSTASH_REDIS_REST_URL / _TOKEN are unset, which is
// the normal state in dev and on a fresh deploy. That is fine for a burst
// guard, but it means the only thing standing between one account and an
// unbounded Gemini bill was a per-minute window that might not be running at
// all. Every turn is already stored with (user_id, created_at) and indexed that
// way, so the quota can be counted from Postgres and is always on.
//
// Guests are not covered here — they have no user id to count against. Their
// ceiling is the trial cookie (lib/chatTrial.js) plus the per-IP burst window.

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// How few questions must be left before the composer says so.
export const QUOTA_WARN_AT = 5;

function readLimit(name, fallback) {
  const raw = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(raw) && raw > 0 ? raw : fallback;
}

// Messages one signed-in account may send in a rolling 24 hours.
export function dailyLimit() {
  return readLimit("CHAT_DAILY_LIMIT", 50);
}

// Fallback burst ceiling, only consulted when Upstash isn't doing it.
export function burstLimit() {
  return readLimit("CHAT_BURST_LIMIT", 10);
}

function countSince(supabase, userId, since) {
  return supabase
    .from("chat_messages")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", new Date(since).toISOString());
}

// Seconds until the window has room again: when the oldest message inside it
// ages out. Only worth a query on the rejection path.
async function retryAfterFor(supabase, userId, windowMs) {
  try {
    const { data } = await supabase
      .from("chat_messages")
      .select("created_at")
      .eq("user_id", userId)
      .eq("role", "user")
      .gte("created_at", new Date(Date.now() - windowMs).toISOString())
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!data?.created_at) return Math.ceil(windowMs / 1000);
    const freesUpAt = new Date(data.created_at).getTime() + windowMs;
    return Math.max(1, Math.ceil((freesUpAt - Date.now()) / 1000));
  } catch {
    return Math.ceil(windowMs / 1000);
  }
}

// Returns { ok, remaining, retryAfter, scope }.
//   scope "day"   -> the daily quota is spent
//   scope "burst" -> too many in the last minute (only checked when asked)
//
// Fails open on any storage error: a counting outage must not take the
// assistant down, and the burst limiter still stands in front of it.
export async function checkChatQuota(supabase, userId, { checkBurst = false, exempt = false } = {}) {
  const limit = dailyLimit();
  if (!userId || exempt) return { ok: true, remaining: null, exempt: true };

  try {
    const now = Date.now();
    const [dayRes, burstRes] = await Promise.all([
      countSince(supabase, userId, now - DAY_MS),
      checkBurst ? countSince(supabase, userId, now - MINUTE_MS) : Promise.resolve(null)
    ]);

    if (dayRes.error) throw new Error(dayRes.error.message);

    const dayUsed = dayRes.count || 0;
    const remaining = Math.max(0, limit - dayUsed);

    if (dayUsed >= limit) {
      return {
        ok: false,
        scope: "day",
        remaining: 0,
        retryAfter: await retryAfterFor(supabase, userId, DAY_MS)
      };
    }

    if (burstRes && !burstRes.error && (burstRes.count || 0) >= burstLimit()) {
      return {
        ok: false,
        scope: "burst",
        remaining,
        retryAfter: await retryAfterFor(supabase, userId, MINUTE_MS)
      };
    }

    return { ok: true, remaining };
  } catch (error) {
    console.error("chat quota check failed:", error?.message || error);
    return { ok: true, remaining: null, skipped: true };
  }
}
