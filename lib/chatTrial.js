import crypto from "crypto";
import { cookies } from "next/headers";

// Anonymous trial for KastoChha Assist: a visitor gets a few questions before
// being asked to sign up, so they can judge the AI before committing.
//
// This is a product teaser, NOT a security boundary. Anyone can clear the
// cookie or open a private window to start over — same as every "free trial"
// paywall. The signature below only stops the cheap tamper (editing the count
// to 0 or a large negative in devtools); real abuse control is the per-IP rate
// limit on the endpoint, which needs Upstash configured to bite.

export const TRIAL_LIMIT = 3;
export const TRIAL_COOKIE = "kc_trial";
const TRIAL_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  return process.env.CLERK_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function sign(count) {
  const key = secret();
  if (!key) return "";
  return crypto.createHmac("sha256", key).update(`kc_trial:${count}`).digest("base64url");
}

// How many trial questions this visitor has already used.
export function readTrialCount() {
  const raw = cookies().get(TRIAL_COOKIE)?.value || "";
  if (!raw) return 0;

  const separator = raw.lastIndexOf(".");
  const countPart = separator === -1 ? raw : raw.slice(0, separator);
  const signature = separator === -1 ? "" : raw.slice(separator + 1);

  const count = Number.parseInt(countPart, 10);
  if (!Number.isInteger(count) || count < 0) return TRIAL_LIMIT;

  const expected = sign(count);
  // A cookie we can verify but whose signature doesn't match was edited by
  // hand — treat the trial as spent rather than trusting the new number.
  if (expected && signature !== expected) return TRIAL_LIMIT;

  return Math.min(count, TRIAL_LIMIT);
}

export function trialRemaining() {
  return Math.max(0, TRIAL_LIMIT - readTrialCount());
}

// Serialized Set-Cookie value for the updated count.
export function trialCookieHeader(count) {
  const safe = Math.max(0, Math.min(count, TRIAL_LIMIT));
  const signature = sign(safe);
  const value = signature ? `${safe}.${signature}` : String(safe);
  const attrs = [
    `${TRIAL_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${TRIAL_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (process.env.NODE_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}
