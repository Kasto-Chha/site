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
  }
};

module.exports = nextConfig;
