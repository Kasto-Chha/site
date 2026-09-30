import { createClient } from "@supabase/supabase-js";

// The server's Supabase client. Service role only, and it fails closed.
//
// This used to fall back to the anon / publishable key whenever
// SUPABASE_SERVICE_ROLE_KEY was missing. Nothing on the server works with that
// key — reviews, votes, the chat ledger and chat history are all RLS-locked to
// the service role (see 0002), and the vote and quota RPCs are granted to it
// alone — but it failed quietly rather than loudly. Most visibly,
// consume_chat_quota was refused, lib/chatQuota.js read that as a database blip
// and failed open, and every signed-in account chatted unmetered.
//
// So a missing or wrong key is now an error at construction, never a weaker
// client. Page reads already catch it and render their fallbacks; routes that
// must not proceed without the service role get a throw they cannot ignore.

// Public keys that must never be accepted in place of the service key — the
// easy mistake is pasting the publishable key into the wrong variable, which
// would recreate the silent fallback this replaces.
const PUBLIC_KEY_VARS = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY"
];

// Legacy Supabase keys are JWTs naming their role. Newer keys are opaque
// (sb_secret_… / sb_publishable_…) and are told apart by prefix instead.
function jwtRole(key) {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))).role || null;
  } catch {
    return null;
  }
}

function looksPublic(key) {
  if (key.startsWith("sb_publishable_")) return true;
  if (PUBLIC_KEY_VARS.some((name) => (process.env[name] || "").trim() === key)) return true;
  const role = jwtRole(key);
  return role !== null && role !== "service_role";
}

export function createServerSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!supabaseUrl) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL.");
  }
  if (!serviceKey) {
    throw new Error("Supabase is not configured: set SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (looksPublic(serviceKey)) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY holds a public (anon/publishable) key, not the service role key."
    );
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });
}
