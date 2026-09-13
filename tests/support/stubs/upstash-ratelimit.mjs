// Stands in for @upstash/ratelimit with an in-memory sliding log.
//
// Upstash's own slidingWindow is an approximation (current window plus a
// weighted slice of the previous one); a true log is stricter and
// deterministic, which is what a test wants. For the assertions here — "N in
// the window pass, N+1 does not" — the two agree.
//
// globalThis.__KC_TEST__.upstash selects the mode:
//   "on"    -> limit normally
//   "error" -> throw, which is how lib/ratelimit.js sees a limiter outage. It
//              returns { ok: true, skipped: true } for that, the same shape it
//              returns when the env vars are absent, so this covers the
//              degraded path too. (tests/ratelimit-unconfigured.test.mjs
//              checks the genuinely-unconfigured case in its own process.)

const WINDOW_MS = { "1 m": 60_000, "1 s": 1_000, "1 h": 3_600_000 };

export class Ratelimit {
  static slidingWindow(tokens, window) {
    return { tokens, windowMs: WINDOW_MS[window] ?? 60_000 };
  }

  constructor({ limiter, prefix }) {
    this.limiter = limiter;
    this.prefix = prefix;
  }

  async limit(identifier) {
    const test = globalThis.__KC_TEST__;
    if (test.upstash === "error") {
      throw new Error("upstash unreachable (simulated)");
    }

    const key = `${this.prefix}:${identifier}`;
    const now = test.now ? test.now() : Date.now();
    const { tokens, windowMs } = this.limiter;

    const log = (test.redis[key] || []).filter((t) => t > now - windowMs);

    // Record the identifier so a test can assert what the route bucketed by.
    test.seenIdentifiers.push(identifier);

    if (log.length >= tokens) {
      test.redis[key] = log;
      return { success: false, limit: tokens, remaining: 0, reset: log[0] + windowMs };
    }

    log.push(now);
    test.redis[key] = log;
    return {
      success: true,
      limit: tokens,
      remaining: tokens - log.length,
      reset: log[0] + windowMs
    };
  }
}
