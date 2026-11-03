import { createServerSupabase } from "../supabase/server";
import { isValidSlug, normalizeSlug } from "./slug";

// Reads of the businesses tagged for KastoChha Sync. Server-only: the table has no
// public access, and this uses the service role. Like the other page readers it
// fails soft: a missing table (before the migration has run) or an unreachable
// database gives null, never a thrown error, so a page falls back to the ordinary
// thread.

const COLUMNS =
  "id, slug, topic_slug, business_name, area, business_kind, category, about, google_place_id, google_review_url, google_maps_url, owner_user_id, status";

async function readOne(column, value, { includeCancelled = false, max = 80 } = {}) {
  const slug = normalizeSlug(value);
  if (!isValidSlug(slug, max)) return null;
  try {
    const supabase = createServerSupabase();
    let query = supabase.from("sync_merchants").select(COLUMNS).eq(column, slug);
    if (!includeCancelled) query = query.eq("status", "active");
    const { data, error } = await query.maybeSingle();
    if (error) {
      console.error("Sync merchant query failed:", error.message);
      return null;
    }
    return data || null;
  } catch (error) {
    console.error("Sync merchant lookup unavailable:", error?.message || error);
    return null;
  }
}

// By the café's own address (/hub/[slug]).
export function getMerchantBySlug(slug, options = {}) {
  return readOne("slug", slug, { ...options, max: 80 });
}

// By the thread's address (the topic_slug on its posts). This is the lookup that lets
// the thread page, the lists and the share cards ask "is this thread a business?".
export function getMerchantByTopicSlug(topicSlug, options = {}) {
  return readOne("topic_slug", topicSlug, { ...options, max: 120 });
}

// What is safe to send to a browser. Never the owner's account, and never internal ids
// that a visitor has no use for.
export function publicMerchant(merchant) {
  if (!merchant) return null;
  return {
    slug: merchant.slug,
    topicSlug: merchant.topic_slug,
    name: merchant.business_name,
    area: merchant.area,
    kind: merchant.business_kind,
    category: merchant.category,
    about: merchant.about || "",
    googleReviewUrl: merchant.google_review_url || "",
    googleMapsUrl: merchant.google_maps_url || "",
    hasOwner: Boolean(merchant.owner_user_id)
  };
}
