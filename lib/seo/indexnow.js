// ---------------------------------------------------------------------------
// IndexNow — tell search engines a URL changed, instead of waiting to be found.
//
// Why this is worth having here specifically:
//
// Search Console shows Googlebot last crawled this domain on 9 April 2026, and
// the sitemap has not been re-read since it was submitted in January. Waiting
// to be crawled is not currently a strategy. IndexNow is a push: publish
// something, and Bing and Yandex are told within seconds rather than whenever
// they next decide to visit.
//
// Google does not participate in IndexNow. That is fine — being indexed
// somewhere beats being indexed nowhere, and Bing traffic is real traffic.
//
// How the protocol works:
//
//   1. Host a text file at /{key}.txt whose entire contents are the key. That
//      proves you control the domain.
//   2. POST the changed urls plus the key. That's it — no account, no quota,
//      no dashboard.
//
// Fire-and-forget on purpose: a publish must never fail because a search
// engine's endpoint was slow. Every path here swallows its own errors and logs.
// ---------------------------------------------------------------------------

const ENDPOINT = "https://api.indexnow.org/indexnow";

export function indexNowKey() {
  return process.env.INDEXNOW_KEY || "";
}

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "";
}

// Submits up to 10,000 urls in one call (the protocol's limit).
//
// `paths` are site-relative ("/discussions/sikko-calculator"). Absolute urls
// are passed through unchanged.
export async function pingIndexNow(paths = []) {
  const key = indexNowKey();
  const base = siteUrl();

  // Both are required, and both fail silently in ways worth naming:
  //
  //   no key  — the /{key}.txt file cannot exist, so every submission is
  //             rejected as unverified
  //   no base — we would submit localhost urls, which is worse than not
  //             submitting at all
  if (!key || !base) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[indexnow] skipped: " +
          (!key ? "INDEXNOW_KEY unset. " : "") +
          (!base ? "NEXT_PUBLIC_SITE_URL unset." : "")
      );
    }
    return { ok: false, skipped: true };
  }

  const list = (Array.isArray(paths) ? paths : [paths])
    .filter(Boolean)
    .map((path) => (path.startsWith("http") ? path : `${base}${path}`))
    .slice(0, 10000);

  if (!list.length) return { ok: false, skipped: true };

  let host;
  try {
    host = new URL(base).host;
  } catch {
    console.warn("[indexnow] skipped: NEXT_PUBLIC_SITE_URL is not a valid URL.");
    return { ok: false, skipped: true };
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `${base}/${key}.txt`,
        urlList: list
      })
    });

    // 200 accepted, 202 accepted but key still being validated. Anything else
    // is worth a log line, but never worth failing the publish over.
    if (!response.ok && response.status !== 202) {
      console.warn(`[indexnow] ${response.status} for ${list.length} url(s)`);
      return { ok: false, status: response.status };
    }

    return { ok: true, count: list.length };
  } catch (error) {
    console.warn("[indexnow] request failed:", error?.message || error);
    return { ok: false };
  }
}

// Convenience wrapper for the common case: something changed on one page, and
// the listing page it appears on changed with it.
export function pingContent(path, indexPath) {
  const paths = [path];
  if (indexPath) paths.push(indexPath);
  // Not awaited by callers — see the fire-and-forget note above.
  return pingIndexNow(paths);
}
