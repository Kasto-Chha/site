// Content-Security-Policy allowlist. Shipped in Report-Only mode first so we can
// watch the browser console for violations from Clerk / Supabase / embeds before
// switching it to the enforcing "Content-Security-Policy" header. Tighten the
// 'unsafe-inline'/'unsafe-eval' allowances once violations are understood.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.clerk.accounts.dev https://clerk-telemetry.com",
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://www.instagram.com https://www.tiktok.com https://player.vimeo.com https://www.facebook.com https://challenges.cloudflare.com https://*.clerk.accounts.dev",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'"
].join("; ");

// Baseline security headers applied to every response.
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
  },
  { key: "Content-Security-Policy-Report-Only", value: csp }
];

const nextConfig = {
  // Defaults to ".next" for dev and for real deploys. Set NEXT_DIST_DIR to send
  // a throwaway verification build somewhere else — a `next build` that writes
  // into the same .next a `next dev` is serving leaves the dev server loading
  // chunk files that no longer exist ("Cannot find module './8948.js'").
  distDir: process.env.NEXT_DIST_DIR || ".next",

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
