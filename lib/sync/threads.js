import { isValidSlug, normalizeSlug } from "./slug";

// Finding KastoChha threads for an admin to turn into business threads. A thread is not
// a row: it is the posts in `reviews` that share a topic_slug. The database groups them
// (the sync_thread_summary view, migration 0019), so this searches, filters, counts and
// pages there, and never loads the posts themselves: it stays fast with thousands of
// threads. Server-only, admin-only, and a database failure is thrown, so the caller can
// say so instead of showing "no threads" when the lookup actually broke.

export const PAGE_SIZE = 8;
export const MAX_PAGE_SIZE = 20;
const MAX_OFFSET = 10000;
const COLUMNS = "topic_slug, title, category, posts, questions, latest, tagged_as";

export function cleanSearch(value) {
  // Wildcards, list separators and quotes have no business in a name search.
  return (value ?? "").toString().replace(/[%_*\\,()"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

// What was typed or pasted: a discussion address (a full link, or /discussions/slug), a
// bare address like himal-brew-house, or words to look for in thread titles.
export function parseThreadQuery(raw) {
  const text = (raw ?? "").toString().trim().slice(0, 300);
  const fromLink = text.match(/\/discussions\/([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/i);
  if (fromLink) {
    const slug = normalizeSlug(fromLink[1]);
    return { slug: isValidSlug(slug, 120) ? slug : "", fromAddress: true, search: "" };
  }
  const bare = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$/.test(text) ? normalizeSlug(text) : "";
  if (bare && isValidSlug(bare, 120)) return { slug: bare, fromAddress: false, search: cleanSearch(bare.replace(/-/g, " ")) };
  return { slug: "", fromAddress: false, search: cleanSearch(text) };
}

export async function threadExists(supabase, slug) {
  const { data, error } = await supabase.from("reviews").select("id").eq("topic_slug", slug).limit(1);
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

// What a thread is called (its first post's title), from the thread summary view. Empty when
// there is no such thread.
export async function threadTitleFor(supabase, slug) {
  const { data, error } = await supabase.from("sync_thread_summary").select("title").eq("topic_slug", slug).limit(1);
  if (error) throw new Error(error.message);
  return data && data[0] ? String(data[0].title || "") : "";
}

function shown(row) {
  return {
    slug: row.topic_slug,
    title: (row.title || row.topic_slug || "").toString(),
    category: row.category || "",
    posts: Number(row.posts) || 0,
    questions: Number(row.questions) || 0,
    latest: row.latest,
    alreadyTaggedAs: row.tagged_as || null
  };
}

function whole(value, fallback, min, max) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

// One page of threads. Options: q (words, or a pasted address), category (a category
// label, or empty for all), includeTagged (also show threads that are already business
// threads), offset and limit. Answers { threads, total, offset, limit, hasMore,
// addressNotFound }.
//
// A pasted address that matches a thread puts that thread first, whatever the filters:
// someone who pastes an address wants that thread, and if it is already a business
// thread they should be told so, not shown nothing.
export async function searchThreads(supabase, { q = "", category = "", includeTagged = false, offset = 0, limit = PAGE_SIZE } = {}) {
  const size = whole(limit, PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const from = whole(offset, 0, 0, MAX_OFFSET);
  const parsed = parseThreadQuery(q);

  let exact = null;
  if (parsed.slug) {
    const found = await supabase.from("sync_thread_summary").select(COLUMNS).eq("topic_slug", parsed.slug).limit(1);
    if (found.error) throw new Error(found.error.message);
    exact = found.data && found.data[0] ? found.data[0] : null;
  }

  if (parsed.fromAddress) {
    return { threads: exact ? [shown(exact)] : [], total: exact ? 1 : 0, offset: 0, limit: size, hasMore: false, addressNotFound: !exact };
  }

  const reserved = exact ? 1 : 0; // the pasted thread takes the first slot of the first page
  const mainOffset = Math.max(0, from - reserved);
  const mainLimit = from === 0 ? size - reserved : size;

  let query = supabase.from("sync_thread_summary").select(COLUMNS, { count: "exact" });
  if (parsed.search) query = query.ilike("title", `%${parsed.search}%`);
  if (category) query = query.eq("category", category);
  if (!includeTagged) query = query.is("tagged_as", null);
  if (exact) query = query.neq("topic_slug", exact.topic_slug);
  query = query
    .order("latest", { ascending: false })
    .order("topic_slug", { ascending: true })
    .range(mainOffset, mainOffset + Math.max(mainLimit, 1) - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const rows = (data || []).slice(0, Math.max(mainLimit, 0));
  const threads = [...(exact && from === 0 ? [shown(exact)] : []), ...rows.map(shown)];
  const total = (Number.isFinite(count) ? count : rows.length) + reserved;
  return { threads, total, offset: from, limit: size, hasMore: from + threads.length < total, addressNotFound: false };
}
