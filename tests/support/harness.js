// Shared setup for the chat rate-limit tests: env, the fake Postgres, a fake
// Gemini, and a helper that posts to the real route handler.

import { FakePostgrest } from "./fake-postgrest.js";

export const db = new FakePostgrest();

let POST;

export async function setup({ upstash = "on" } = {}) {
  await db.listen();

  process.env.NEXT_PUBLIC_SUPABASE_URL = db.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.CLERK_SECRET_KEY = "sk_test_trial_cookie_signing_key";
  process.env.CHAT_LIVE_SEARCH = "off";
  // lib/ratelimit.js reads these once at import to decide whether to build a
  // limiter at all; the stub decides per call whether it works.
  process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";

  resetState({ upstash });
  interceptGemini();

  ({ POST } = await import("../../app/api/chat/route.js"));
}

export async function teardown() {
  await db.close();
}

// keepDatabase clears the in-process counters (Upstash window, Gemini calls)
// without emptying the tables — for tests that need to isolate one ceiling
// from another while keeping the rows they just set up.
export function resetState({ upstash = "on", keepDatabase = false } = {}) {
  globalThis.__KC_TEST__ = {
    userId: null,
    roles: {},
    cookies: {},
    upstash,
    redis: {},
    seenIdentifiers: [],
    geminiCalls: 0
  };
  if (!keepDatabase) db.reset();
}

export function state() {
  return globalThis.__KC_TEST__;
}

const GEMINI = "https://generativelanguage.googleapis.com";

function interceptGemini() {
  if (globalThis.__KC_FETCH_PATCHED__) return;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (!url.startsWith(GEMINI)) return original(input, init);

    state().geminiCalls += 1;
    const sse =
      `data: ${JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Thik chha yaar." }] } }]
      })}\n\n`;
    return new Response(sse, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" }
    });
  };
  globalThis.__KC_FETCH_PATCHED__ = true;
}

// Post a question to the real handler. Returns the status, headers and the
// fully-drained body, so a streamed answer has finished storing by the time a
// test looks at the database.
export async function chat({
  userId = null,
  role = null,
  cookie = null,
  ip = "203.0.113.10",
  forwardedFor = null,
  message = "iPhone 17 ko price kati?",
  topicId = null,
  body
} = {}) {
  const test = state();
  test.userId = userId;
  if (userId && role) test.roles[userId] = role;
  test.cookies = cookie === null ? {} : { kc_trial: cookie };

  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("x-forwarded-for", forwardedFor === null ? ip : forwardedFor);

  const payload =
    body !== undefined
      ? body
      : { messages: [{ role: "user", content: message }], ...(topicId ? { topicId } : {}) };

  const request = new Request("https://kastochha.com/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const response = await POST(request);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* streamed answers are plain text, not JSON */
  }

  return {
    status: response.status,
    headers: response.headers,
    text,
    json,
    setCookie: response.headers.get("set-cookie"),
    trialRemaining: response.headers.get("x-chat-trial-remaining"),
    dailyRemaining: response.headers.get("x-chat-daily-remaining"),
    retryAfter: response.headers.get("retry-after")
  };
}

// The Set-Cookie the route hands back, in the form the browser would send it
// back up — so a test can replay a guest's own cookie instead of forging one.
export function cookieValueFrom(setCookieHeader) {
  if (!setCookieHeader) return null;
  return setCookieHeader.split(";")[0].split("=").slice(1).join("=");
}
