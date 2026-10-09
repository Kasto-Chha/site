import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

import { buildContentSecurityPolicy, createNonce, cspHeaderName } from "./lib/csp";

// Clerk handles the auth context; on the way through, every page request gets
// a fresh CSP nonce (see lib/csp.js).
//
// The policy is set on the REQUEST as well as the response. Next reads the
// nonce from the request's Content-Security-Policy header while rendering, and
// ClerkProvider reads x-nonce — both server-side, so the response header alone
// would leave every script unstamped and the page would block itself. Setting
// both here also overwrites anything a client sent under those names.
export default clerkMiddleware((auth, request) => {
  // API responses are not documents; a CSP on them protects nothing.
  if (request.nextUrl.pathname.startsWith("/api/")) return;

  const nonce = createNonce();
  const policy = buildContentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV === "development"
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(cspHeaderName(), policy);
  return response;
});

export const config = {
  matcher: [
    "/((?!_next|.*\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|map)).*)",
    "/(api|trpc)(.*)"
  ]
};
