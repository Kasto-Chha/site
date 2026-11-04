// Reading every row of a query, a page at a time.
//
// Hosted Supabase never returns more than its max-rows setting (1,000 by default) from one request,
// whatever limit is asked for, and says nothing when it cuts a result short. A count made from one
// request therefore stops at 1,000 without any sign that it did. Anything that adds up rows (scans,
// taps, posts) must page, and must say so when it gave up.
//
// `build` makes a fresh query each time, and must order it completely (a timestamp, then the id),
// or rows that share a timestamp can be skipped or repeated between pages.

export const PAGE_SIZE = 1000;
export const MAX_PAGES = 100;

export async function fetchAll(build, { pageSize = PAGE_SIZE, maxPages = MAX_PAGES } = {}) {
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const got = data || [];
    rows.push(...got);
    // A short page is the last one. (A server that caps below pageSize would look short too, which
    // is why pageSize is the usual cap: never ask for more than the server will give.)
    if (got.length < pageSize) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

// The same, for a query that needs a long list of values in an `in` filter: URLs have a length
// limit, so the list is split into chunks and each chunk is read in full.
export async function fetchAllChunked(values, chunkSize, build, options) {
  const rows = [];
  let truncated = false;
  for (let i = 0; i < values.length; i += chunkSize) {
    const part = await fetchAll(() => build(values.slice(i, i + chunkSize)), options);
    rows.push(...part.rows);
    truncated = truncated || part.truncated;
  }
  return { rows, truncated };
}
