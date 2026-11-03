// Finding KastoChha threads for an admin to turn into business threads. A thread is
// not a row: it is the posts in `reviews` that share a topic_slug, so this groups
// posts. Server-only, admin-only, and it reports database failures by throwing so the
// caller can say so, rather than showing "no threads" when the lookup actually broke.

const COLUMNS = "topic_slug, topic, title, category, kind, created_at";
const MAX_SCAN = 400;

export function cleanSearch(value) {
  // Wildcards, list separators and quotes have no business in a name search.
  return (value ?? "").toString().replace(/[%_*\\,()"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

async function read(supabase, build) {
  const { data, error } = await build(supabase.from("reviews").select(COLUMNS));
  if (error) throw new Error(error.message);
  return data || [];
}

export async function threadExists(supabase, slug) {
  const { data, error } = await supabase.from("reviews").select("id").eq("topic_slug", slug).limit(1);
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

// Exact numbers for one thread, read from its own posts so a long thread is not
// undercounted by the scan above.
async function threadFacts(supabase, slug) {
  const rows = await read(supabase, (q) => q.eq("topic_slug", slug).order("created_at", { ascending: true }).limit(2000));
  if (rows.length === 0) return null;
  const first = rows[0];
  return {
    slug,
    title: (first.topic || first.title || slug).toString(),
    category: first.category || "",
    posts: rows.filter((r) => r.kind !== "question").length,
    questions: rows.filter((r) => r.kind === "question").length,
    latest: rows[rows.length - 1].created_at
  };
}

export async function searchThreads(supabase, rawQuery, { limit = 12 } = {}) {
  const query = cleanSearch(rawQuery);
  let candidates;
  if (query) {
    const pattern = `%${query}%`;
    const [byTopic, byTitle] = await Promise.all([
      read(supabase, (q) => q.ilike("topic", pattern).order("created_at", { ascending: false }).limit(MAX_SCAN)),
      read(supabase, (q) => q.ilike("title", pattern).order("created_at", { ascending: false }).limit(MAX_SCAN))
    ]);
    const needle = query.toLowerCase();
    candidates = [...byTopic, ...byTitle].filter((r) => `${r.topic || ""} ${r.title || ""} ${r.topic_slug || ""}`.toLowerCase().includes(needle));
  } else {
    candidates = await read(supabase, (q) => q.order("created_at", { ascending: false }).limit(MAX_SCAN));
  }

  const slugs = [];
  for (const row of candidates) {
    if (row.topic_slug && !slugs.includes(row.topic_slug)) slugs.push(row.topic_slug);
    if (slugs.length >= limit * 3) break;
  }

  const threads = [];
  for (const slug of slugs) {
    const facts = await threadFacts(supabase, slug);
    if (facts) threads.push(facts);
  }

  const taggedRows = slugs.length
    ? await (async () => {
        const { data, error } = await supabase.from("sync_merchants").select("topic_slug, business_name").in("topic_slug", slugs);
        if (error) throw new Error(error.message);
        return data || [];
      })()
    : [];
  const tagged = new Map(taggedRows.map((r) => [r.topic_slug, r.business_name]));

  const needle = query.toLowerCase();
  return threads
    .map((t) => ({ ...t, alreadyTaggedAs: tagged.get(t.slug) || null }))
    .sort((a, b) => {
      const exact = Number(b.title.toLowerCase() === needle) - Number(a.title.toLowerCase() === needle);
      if (exact) return exact;
      if (b.posts + b.questions !== a.posts + a.questions) return b.posts + b.questions - (a.posts + a.questions);
      return String(b.latest).localeCompare(String(a.latest));
    })
    .slice(0, limit);
}
