import { createClient } from "@supabase/supabase-js";

export function createServerSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing. Expected SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and a valid Supabase key.");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
}
