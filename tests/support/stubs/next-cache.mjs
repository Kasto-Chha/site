// Stands in for next/cache. lib/supabase/queries.js calls unstable_noStore()
// to opt out of Next's data cache; outside a Next request there is no cache to
// opt out of, so this is a no-op.

export function unstable_noStore() {}
export function revalidatePath() {}
export function revalidateTag() {}
