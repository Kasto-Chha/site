import { indexNowKey } from "../../../lib/seo/indexnow";

export const dynamic = "force-dynamic";

// IndexNow verifies domain ownership by fetching a text file whose name is the
// key and whose entire contents are the same key, served from the site root.
//
// Reaching this route: next.config.js rewrites /{anything}.txt here. That
// rewrite is returned as a plain array, which Next applies *after* filesystem
// routes — so /robots.txt and /sitemap.xml still win and are unaffected.
//
// Serving the key from a route rather than /public keeps it in an environment
// variable, so it can be rotated without a commit.
export async function GET(request) {
  const key = indexNowKey();
  const requested = new URL(request.url).searchParams.get("key") || "";

  // 404 on a wrong guess: nothing here confirms whether a key is configured.
  if (!key || requested !== key) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(key, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
