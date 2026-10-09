// Content-Security-Policy, built per request around a fresh nonce.
//
// This replaces a Report-Only policy that allowed 'unsafe-inline' and
// 'unsafe-eval' for scripts, which in enforcing mode would have blocked
// nothing an attacker cares about. Scripts are now allowed by nonce:
// middleware.js mints one per request and hands it to
//
//   * Next, via the request's Content-Security-Policy header — Next stamps it
//     on its bootstrap scripts and the inline flight-data scripts;
//   * Clerk, via x-nonce — <ClerkProvider dynamic> puts it on the clerk-js
//     <script> it renders into the HTML;
//   * Google Analytics, via app/layout.js.
//
// 'strict-dynamic' extends that trust to scripts those load at runtime —
// clerk-js pulling in Cloudflare Turnstile, gtag loading its own modules — so
// their hosts need not be listed. Browsers that understand 'strict-dynamic'
// ignore the host entries in script-src; they are there for older ones.
//
// style-src keeps 'unsafe-inline'. React renders style="" attributes and Clerk
// injects its component CSS at runtime; neither can carry a nonce, and CSS
// cannot run script.

// Clerk's Frontend API host is encoded in the publishable key:
// pk_live_<base64("clerk.example.com$")>. Deriving it means the policy follows
// whichever instance (development or production) the deployment is keyed for.
function clerkFrontendApi() {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  const encoded = key.replace(/^pk_(test|live)_/, "");
  if (!encoded || encoded === key) return null;
  try {
    const host = atob(encoded).replace(/\$$/, "");
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
  } catch {
    return null;
  }
}

// GA4 sends hits to the bare analytics.google.com/g/collect, which the
// *.analytics.google.com wildcard does not cover — found by loading the site
// under this policy, where every page view was blocked without it.
const GOOGLE_ANALYTICS = [
  "https://*.google-analytics.com",
  "https://analytics.google.com",
  "https://*.analytics.google.com",
  "https://*.googletagmanager.com",
  "https://*.g.doubleclick.net",
  "https://www.google.com"
];

// Reel and discussion embeds (lib/embeds.js) and Clerk's bot check.
const FRAMES = [
  "https://challenges.cloudflare.com",
  "https://www.youtube-nocookie.com",
  "https://www.youtube.com",
  "https://www.instagram.com",
  "https://www.tiktok.com",
  "https://player.vimeo.com",
  "https://www.facebook.com"
];

export function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildContentSecurityPolicy(nonce, { dev = false } = {}) {
  const clerk = clerkFrontendApi();

  const directives = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // React Refresh evaluates code in development. Production never needs it.
      dev && "'unsafe-eval'",
      clerk,
      "https://challenges.cloudflare.com",
      "https://www.googletagmanager.com"
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      clerk,
      "https://clerk-telemetry.com",
      "https://*.clerk-telemetry.com",
      "https://img.clerk.com",
      ...GOOGLE_ANALYTICS,
      // The development server's hot-reload socket.
      dev && "ws:"
    ],
    "frame-src": ["'self'", ...FRAMES],
    "worker-src": ["'self'", "blob:"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'"],
    "object-src": ["'none'"]
  };

  return Object.entries(directives)
    .map(([name, sources]) => [name, ...sources.filter(Boolean)].join(" "))
    .join("; ");
}

// Enforcing by default. CSP_REPORT_ONLY=true sends the same policy as
// Report-Only instead: a switch for diagnosing a breakage in production without
// a code change, not a place to leave it.
export function cspHeaderName() {
  return process.env.CSP_REPORT_ONLY === "true"
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
}
