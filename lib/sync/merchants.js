import { createServerSupabase } from "../supabase/server";
import { kindDisplay } from "./businessTypes";
import { pinnedTitle } from "./threadPage";
import { isValidSlug, merchantTitle, normalizeSlug } from "./slug";

// Reads of the businesses tagged for KastoChha Sync. Server-only: the table has no
// public access, and this uses the service role. Like the other page readers it
// fails soft: a missing table (before the migration has run) or an unreachable
// database gives null, never a thrown error, so a page falls back to the ordinary
// thread.

const COLUMNS =
  "id, slug, topic_slug, business_name, area, business_kind, kind_label, thread_title, category, about, google_place_id, google_review_url, google_maps_url, owner_user_id, status";

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
    kindName: kindDisplay(merchant.business_kind, merchant.kind_label),
    threadTitle: pinnedTitle(merchant),
    category: merchant.category,
    about: merchant.about || "",
    googleReviewUrl: merchant.google_review_url || "",
    googleMapsUrl: merchant.google_maps_url || "",
    hasOwner: Boolean(merchant.owner_user_id)
  };
}

// ---------- for the admin screens ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function threadCounts(supabase, topicSlug) {
  const { data, error } = await supabase.from("reviews").select("kind").eq("topic_slug", topicSlug).limit(2000);
  if (error) throw new Error(error.message);
  const rows = data || [];
  return { posts: rows.filter((r) => r.kind !== "question").length, questions: rows.filter((r) => r.kind === "question").length };
}

// Every tagged business, newest first, with its thread's post and question counts.
// { merchants, error }: an error is shown to the admin, never hidden as an empty list.
// `onlyIds` limits the list to those businesses (an operator's): an empty list is none, never all.
export async function listMerchantsForAdmin({ onlyIds = null } = {}) {
  if (Array.isArray(onlyIds) && onlyIds.length === 0) return { merchants: [], error: null };
  try {
    const supabase = createServerSupabase();
    let query = supabase
      .from("sync_merchants")
      .select(COLUMNS + ", created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (Array.isArray(onlyIds)) query = query.in("id", onlyIds);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const merchants = [];
    for (const row of data || []) merchants.push({ ...row, ...(await threadCounts(supabase, row.topic_slug)) });
    return { merchants, error: null };
  } catch (error) {
    console.error("Sync merchant list failed:", error?.message || error);
    return { merchants: [], error: "Could not load the businesses. Have the Sync migrations (0018 to 0020) been run?" };
  }
}

// One business by id, whatever its status, with its thread's counts.
export async function getMerchantById(id) {
  if (!UUID_RE.test(String(id || ""))) return { merchant: null, error: null };
  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase.from("sync_merchants").select(COLUMNS + ", created_at, updated_at").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { merchant: null, error: null };
    return { merchant: { ...data, ...(await threadCounts(supabase, data.topic_slug)) }, error: null };
  } catch (error) {
    console.error("Sync merchant lookup failed:", error?.message || error);
    return { merchant: null, error: "Could not load this business." };
  }
}

// ---------- for the discussions list ----------

const MAX_SLUGS = 100;

// The active businesses behind a set of threads, as { topicSlug: {...} }, for the list to name
// them and mark them. Only what is safe to show a visitor: never the owner's account or ids.
// Fails soft (an empty map), so a list never breaks because this could not be read.
export async function getBusinessesByTopicSlugs(slugs) {
  const unique = [...new Set((Array.isArray(slugs) ? slugs : []).filter((s) => typeof s === "string").map(normalizeSlug).filter((s) => isValidSlug(s, 120)))].slice(0, MAX_SLUGS);
  if (!unique.length) return {};
  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase.from("sync_merchants").select(COLUMNS).in("topic_slug", unique).eq("status", "active");
    if (error) {
      console.error("Sync business list query failed:", error.message);
      return {};
    }
    const out = {};
    for (const row of data || []) out[row.topic_slug] = publicBusiness(row);
    return out;
  } catch (error) {
    console.error("Sync business list unavailable:", error?.message || error);
    return {};
  }
}

// What a visitor may be shown about a business: its current name, never anything about an account.
function publicBusiness(row) {
  return {
    name: row.business_name,
    area: row.area,
    title: merchantTitle(row),
    category: row.category,
    kindName: kindDisplay(row.business_kind, row.kind_label)
  };
}

// Every active business, as { topicSlug: {...} }, for a page that does not know its threads before it has loaded
// them (the home page). It is read at the same time as the threads, not after, so it adds no waiting; the caller keeps
// only the ones it needs. Fails soft, like the lookup above.
const MAX_ACTIVE_BUSINESSES = 500;
export async function getActiveBusinessMap() {
  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase.from("sync_merchants").select(COLUMNS).eq("status", "active").limit(MAX_ACTIVE_BUSINESSES);
    if (error) {
      console.error("Sync active business query failed:", error.message);
      return {};
    }
    const out = {};
    for (const row of data || []) out[row.topic_slug] = publicBusiness(row);
    return out;
  } catch (error) {
    console.error("Sync active businesses unavailable:", error?.message || error);
    return {};
  }
}
