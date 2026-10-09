// Stands in for next/cache. lib/supabase/queries.js calls unstable_noStore()
// to opt out of Next's data cache; outside a Next request there is no cache to
// opt out of, so this is a no-op.

export function unstable_noStore() {}
export function revalidatePath() {}

// unstable_cache without the cache: every call runs the function. What Next
// caches and for how long is Next's to get right; what these tests care about
// is what the function works out, and that a tag is dropped when it should be.
export function unstable_cache(fn) {
  return fn;
}

export function revalidateTag(tag) {
  const test = globalThis.__KC_TEST__;
  if (!test) return;
  test.revalidatedTags = [...(test.revalidatedTags || []), tag];
}
