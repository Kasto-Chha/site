// The Overview's "Speed limits are off" warning (found in testing as check F10: the limits were off for an unknown
// time, because the database behind them had been deleted, and nothing said so).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { limiterStatus } = await import("../lib/ratelimit.js");
const SET = { UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" };

test("both settings missing, or one of them, is reported by name", async () => {
  assert.match((await limiterStatus({ env: {} })).detail, /UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN/);
  assert.match((await limiterStatus({ env: { UPSTASH_REDIS_REST_URL: "u" } })).detail, /^UPSTASH_REDIS_REST_TOKEN is not set/);
  assert.match((await limiterStatus({ env: { UPSTASH_REDIS_REST_TOKEN: "t" } })).detail, /^UPSTASH_REDIS_REST_URL is not set/);
  assert.equal((await limiterStatus({ env: {} })).state, "missing");
});

test("a database that answers is on; one that errors, or is too slow, is unreachable and says why", async () => {
  assert.deepEqual(await limiterStatus({ env: SET, ping: async () => "PONG" }), { state: "on" });
  const deleted = await limiterStatus({ env: SET, ping: async () => { throw new Error("fetch failed"); } });
  assert.equal(deleted.state, "unreachable");
  assert.match(deleted.detail, /fetch failed/);
  const wrong = await limiterStatus({ env: SET, ping: async () => { throw new Error("WRONGPASS invalid or missing auth token"); } });
  assert.match(wrong.detail, /WRONGPASS/);
  const slow = await limiterStatus({ env: SET, timeoutMs: 20, ping: () => new Promise(() => {}) });
  assert.equal(slow.state, "unreachable");
  assert.match(slow.detail, /no answer within 20 ms/);
});

test("an error message is cut short and never carries the settings", async () => {
  const long = await limiterStatus({ env: { UPSTASH_REDIS_REST_URL: "https://secret-host.upstash.io", UPSTASH_REDIS_REST_TOKEN: "SECRETTOKEN" }, ping: async () => { throw new Error("x".repeat(500)); } });
  assert.ok(long.detail.length < 160);
  assert.doesNotMatch(JSON.stringify(long), /SECRETTOKEN|secret-host/);
});

test("the Overview shows the warning, and a failed check never breaks the page", () => {
  const page = fs.readFileSync("app/admin/sync/page.js", "utf8");
  assert.match(page, /limiterStatus/);
  assert.match(page, /Speed limits are off: \{limiter\.detail\}/);
  assert.match(page, /DAILY_CAP_PER_BUSINESS/);
  assert.match(page, /try \{\s+limiter = await limiterStatus\(\);\s+\} catch/);
});
