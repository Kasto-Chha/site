// Baseline security headers applied to every response. The
// Content-Security-Policy is not here: it carries a per-request nonce, so
// middleware.js builds it (lib/csp.js).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()"
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload"
  }
];

// Exact hostnames only: YouTube's thumbnail CDN (reel covers), this project's
// Supabase host (storage), and whatever IMAGE_HOSTS adds, comma-separated.
function optimizedImageHosts() {
  const hosts = new Set(["i.ytimg.com"]);
  try {
    hosts.add(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname);
  } catch {
    // Not configured; nothing to add.
  }
  for (const entry of (process.env.IMAGE_HOSTS || "").split(",")) {
    const host = entry.trim().toLowerCase();
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) hosts.add(host);
  }
  return [...hosts];
}

const OPTIMIZED_IMAGE_HOSTS = optimizedImageHosts();

const nextConfig = {
  // Defaults to ".next" for dev and for real deploys. Set NEXT_DIST_DIR to send
  // a throwaway verification build somewhere else — a `next build` that writes
  // into the same .next a `next dev` is serving leaves the dev server loading
  // chunk files that no longer exist ("Cannot find module './8948.js'").
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // Hosts the image optimizer may fetch from. This was every https host, on
  // the reasoning that only admins choose image URLs. But the optimizer is
  // /_next/image?url=..., and anyone can call it with any url: a wildcard made
  // our server fetch and re-encode arbitrary URLs on request, internal
  // addresses included.
  //
  // Editors can still use any https image — <RemoteImage> renders hosts not
  // listed here unoptimized, loaded by the browser rather than by us. Add a
  // host to IMAGE_HOSTS to have it resized and re-encoded again.
  images: {
    remotePatterns: OPTIMIZED_IMAGE_HOSTS.map((hostname) => ({ protocol: "https", hostname }))
  },

  // The same list, inlined for lib/images.js so components know which sources
  // may go to the optimizer.
  env: {
    OPTIMIZED_IMAGE_HOSTS: OPTIMIZED_IMAGE_HOSTS.join(",")
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  },

  // IndexNow's key file has to sit at the site root as /{key}.txt. This maps
  // that request to the route that serves it.
  //
  // The [a-f0-9]{8,128} constraint is deliberate. A bare "/:key.txt" also
  // matches /robots.txt, and while Next applies array rewrites after filesystem
  // routes — so robots.txt would win anyway — quietly depending on that
  // ordering to protect the robots file is not a trade worth making. Requiring
  // hex means /robots.txt cannot match at all ("r" is not a hex digit), so
  // INDEXNOW_KEY must be a hex string. `openssl rand -hex 16` gives one.
  async rewrites() {
    return [
      {
        source: "/:key([a-f0-9]{8,128}).txt",
        destination: "/api/indexnow-key?key=:key"
      }
    ];
  },

  // The blog was removed. Its URLs were in the sitemap, so anything still
  // pointing at them lands on the front page instead of a 404.
  async redirects() {
    return [
      { source: "/blog", destination: "/featured", permanent: true },
      { source: "/blog/page/:n", destination: "/featured", permanent: true },
      // The V1 blog is being republished into Featured with its original slugs
      // intact, so /blog/how-lokta-paper-outlived-empires maps straight across.
      // Previously every one of these went to the homepage, which is a soft 404
      // — the reader asked for an article and got a front page.
      //
      // A slug that hasn't been republished yet still 404s at the destination.
      // That is the honest answer, and better than sending everyone to "/".
      { source: "/blog/:slug", destination: "/featured/:slug", permanent: true },

      // The discussions index moved from /experience to /discussions, so the
      // section index and its topic pages finally share one vocabulary
      // (/discussions and /discussions/{topic-slug}) instead of two.
      //
      // Permanent (301) rather than temporary: the old path should stop being
      // treated as a page in its own right and hand any credit to the new one.
      // Fragments like #share-review are never sent to the server, so the
      // browser reapplies them after the redirect on its own.
      { source: "/experience", destination: "/discussions", permanent: true },
      { source: "/experience/:path*", destination: "/discussions/:path*", permanent: true }
    ];
  }
};

module.exports = nextConfig;
