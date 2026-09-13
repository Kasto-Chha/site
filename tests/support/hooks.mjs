// Module hooks for the chat rate-limit tests.
//
// Two jobs:
//
//  1. Swap the four packages the route pulls in that need a live service
//     (Clerk, Next's cookie store, Upstash) for in-memory stand-ins. Everything
//     under lib/ and app/api/ is the real thing — the point of these tests is
//     to run the actual limiter code, not a re-implementation of it.
//
//  2. Force project .js files to load as ESM. package.json has no
//     "type": "module" because Next compiles these itself, so plain node would
//     otherwise read `import` in app/api/chat/route.js as CommonJS and fail.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const STUBS = {
  "@clerk/nextjs/server": "./stubs/clerk.mjs",
  "next/headers": "./stubs/next-headers.mjs",
  "@upstash/ratelimit": "./stubs/upstash-ratelimit.mjs",
  "@upstash/redis": "./stubs/upstash-redis.mjs"
};

export async function resolve(specifier, context, next) {
  const stub = STUBS[specifier];
  if (stub) {
    return { url: new URL(stub, import.meta.url).href, shortCircuit: true };
  }
  try {
    return await next(specifier, context);
  } catch (error) {
    // Next resolves extensionless relative imports ("../../lib/supabase/server");
    // plain node does not. Retry with the extensions Next would have tried.
    if (error?.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".")) throw error;
    for (const ext of [".js", ".mjs", "/index.js"]) {
      try {
        return await next(specifier + ext, context);
      } catch {
        /* try the next one */
      }
    }
    throw error;
  }
}

export async function load(url, context, next) {
  // Anything of ours that node would treat as CommonJS is really ESM. Read the
  // source here rather than asking `next` for it: node hands back a null source
  // for CommonJS and expects to read the file itself.
  if (url.startsWith("file:") && url.endsWith(".js") && !url.includes("/node_modules/")) {
    const source = await readFile(fileURLToPath(url), "utf8");
    return { format: "module", source, shortCircuit: true };
  }
  return next(url, context);
}
