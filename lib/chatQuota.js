// Volume limits for the AI assistant, counted in the chat_usage ledger.
//
// Why a ledger and not the conversation itself: this used to count rows in
// chat_messages, which meant the quota could be erased by the product's own
// "delete my chat history" button (the messages cascade with the topic), never
// applied to guests at all (they have no user_id to count), and was a
// read-then-act check that concurrent requests could all pass at once. See
// supabase/migrations/0013_chat_usage_ledger.sql.
//
// The ledger holds an opaque identity and a timestamp — nothing else. Guests
// are identified by a salted hash of their IP, so a caller who clears the
// trial cookie still meets a ceiling, without the table becoming a log of who
// asked what from where.
//
// This layer is always on: it needs Postgres, which the app already requires,
// rather than Upstash, which is optional. lib/ratelimit.js remains the fast
// per-minute guard in front of it.

import crypto from "crypto";

const IDENTITY_SALT_FALLBACK = "kc-chat-usage";

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

// The same ceiling for one guest address. Kept separate and more generous than
// the 3-question trial because an address is not a person: shared offices,
// campuses and carrier-grade NAT (common in Nepal) put many real visitors
// behind one IP, and this number is what they share.
export function guestDailyLimit() {
  return readLimit("CHAT_GUEST_DAILY_LIMIT", 30);
}

// Per-minute ceiling, applied by the ledger only when Upstash isn't doing it.
export function burstLimit() {
  return readLimit("CHAT_BURST_LIMIT", 10);
}

export function userIdentity(userId) {
  return `user:${userId}`;
}

// Salted so the ledger cannot be walked back to an address by anyone who reads
// it. Rotating the key resets guest counters, which is a fine trade for not
// storing raw IPs.
export function guestIdentity(ip) {
  const salt =
    process.env.CLERK_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    IDENTITY_SALT_FALLBACK;
  const digest = crypto.createHmac("sha256", salt).update(`ip:${ip || "unknown"}`).digest("hex");
  return `ip:${digest}`;
}

// Check both windows and reserve a slot, in one transaction.
//
// Returns { ok, remaining, scope, retryAfter }:
//   scope "day"   -> the rolling 24h quota is spent
//   scope "burst" -> too many in the last minute (only checked when asked)
//
// On success a row has already been written, so the question is paid for
// whether or not the answer ends up stored. Call this once per request, after
// the payload has been validated — a rejected request should not spend one.
//
// Fails open for a signed-in user on any storage error: a database blip must
// not take the assistant down for people we can identify. The caller decides
// what to do about a guest (see FAIL_OPEN_FOR_GUESTS in the chat route).
export async function consumeChatQuota(
  supabase,
  identity,
  { limit, checkBurst = false, exempt = false } = {}
) {
  if (!identity || exempt) return { ok: true, remaining: null, exempt: true };

  try {
    const { data, error } = await supabase.rpc("consume_chat_quota", {
      p_identity: identity,
      p_day_limit: limit,
      p_burst_limit: burstLimit(),
      p_check_burst: checkBurst
    });

    if (error) throw new Error(error.message);

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("consume_chat_quota returned no row");

    return {
      ok: Boolean(row.allowed),
      remaining: row.remaining,
      scope: row.scope || null,
      retryAfter: row.retry_after || 60
    };
  } catch (error) {
    console.error("chat quota check failed:", error?.message || error);
    return { ok: true, remaining: null, skipped: true };
  }
}

// How many questions are left, without spending one. For the page that renders
// the composer — never for the endpoint that answers.
export async function peekChatQuota(supabase, identity, { limit } = {}) {
  if (!identity) return { remaining: null };

  try {
    const { count, error } = await supabase
      .from("chat_usage")
      .select("*", { count: "exact", head: true })
      .eq("identity", identity)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (error) throw new Error(error.message);
    return { remaining: Math.max(0, limit - (count || 0)) };
  } catch (error) {
    console.error("chat quota peek failed:", error?.message || error);
    return { remaining: null };
  }
}
