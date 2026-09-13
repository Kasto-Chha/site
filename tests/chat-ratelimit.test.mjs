// Rate limiting on POST /api/chat, exercised against the real route handler.
//
// Run with:  npm test
//
// The ceilings under test, outermost first:
//   1. guest trial cookie      lib/chatTrial.js   3 questions, signed
//   2. burst window (Upstash)  lib/ratelimit.js   10/min per account or IP
//   3. burst window (ledger)   lib/chatQuota.js   10/min, only when 2 is absent
//   4. daily quota (ledger)    lib/chatQuota.js   50/day account, 30/day guest
//
// 3 and 4 are counted in chat_usage, which nothing cascades to and which the
// consume_chat_quota RPC reserves from atomically. Tests named "by design"
// pin a deliberate trade-off rather than a defect.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { setup, teardown, resetState, state, db, chat, cookieValueFrom } from "./support/harness.js";
import { guestIdentity, userIdentity } from "../lib/chatQuota.js";

before(() => setup());
after(() => teardown());
beforeEach(() => resetState());

const USER = "user_2abcTESTclerkid";
const IDENTITY = userIdentity(USER);

// Comfortably outside the 1-minute burst window, inside the 24-hour one.
const EARLIER = { spreadMs: 60_000, endingAt: Date.now() - 5 * 60_000 };

// --------------------------------------------------------------------------
// 1. Guest trial cookie
// --------------------------------------------------------------------------

test("guest: first question is allowed and spends one trial", async () => {
  const res = await chat();
  assert.equal(res.status, 200);
  assert.equal(res.trialRemaining, "2");
  assert.match(res.setCookie, /^kc_trial=1\./, "cookie carries the count and a signature");
  assert.match(res.setCookie, /HttpOnly/);
  assert.match(res.setCookie, /SameSite=Lax/);
});

test("guest: trial runs out after TRIAL_LIMIT questions", async () => {
  let cookie = null;
  for (let i = 1; i <= 3; i += 1) {
    const res = await chat({ cookie });
    assert.equal(res.status, 200, `question ${i} should be allowed`);
    assert.equal(res.trialRemaining, String(3 - i));
    cookie = cookieValueFrom(res.setCookie);
  }

  const blocked = await chat({ cookie });
  assert.equal(blocked.status, 401);
  assert.equal(blocked.json.signUpRequired, true);
  assert.equal(blocked.trialRemaining, "0");
  assert.equal(state().geminiCalls, 3, "the blocked question never reached Gemini");
});

test("guest: a hand-edited count is rejected by the signature", async () => {
  const forged = ["0.notarealsignature", "0", "1.", "0.AAAA"];
  for (const cookie of forged) {
    const res = await chat({ cookie });
    assert.equal(res.status, 401, `forged cookie ${cookie} should be treated as spent`);
  }
  assert.equal(state().geminiCalls, 0);
});

test("guest: a negative or absurd count cannot buy extra questions", async () => {
  for (const cookie of ["-1", "-999999", "NaN.x"]) {
    const res = await chat({ cookie });
    assert.equal(res.status, 401, `${cookie} should be treated as spent`);
  }

  // A large count is clamped down, not up — it stays spent.
  const huge = await chat({ cookie: "999999" });
  assert.equal(huge.status, 401);
});

// Not a separate hole: replaying an old cookie is no cheaper than deleting it,
// which the next test shows is already free. Pinned so a future attempt to
// harden the cookie (a nonce, an expiry) has to face the replay case too.
test("guest: replaying an older signed cookie rewinds the trial", async () => {
  const first = await chat();
  const afterOne = cookieValueFrom(first.setCookie); // a valid, signed "1"

  await chat({ cookie: afterOne });
  await chat({ cookie: cookieValueFrom((await chat({ cookie: afterOne })).setCookie) });

  // The signature covers the count and nothing else — no visitor, no nonce, no
  // expiry — so the count=1 cookie stays valid forever and can be replayed.
  const replayed = await chat({ cookie: afterOne });
  assert.equal(replayed.status, 200, "replaying an old signed cookie is accepted today");
  assert.equal(replayed.trialRemaining, "1");
});

test("guest: dropping the cookie restarts the trial (BYPASS, by design)", async () => {
  let cookie = null;
  for (let i = 0; i < 3; i += 1) cookie = cookieValueFrom((await chat({ cookie })).setCookie);
  assert.equal((await chat({ cookie })).status, 401);

  const fresh = await chat({ cookie: null });
  assert.equal(fresh.status, 200, "no cookie means a fresh trial — the burst window is the real guard");
});

// --------------------------------------------------------------------------
// 2. Burst window, Upstash configured
// --------------------------------------------------------------------------

test("guest: the per-IP burst window caps a cookie-clearing flood", async () => {
  const allowed = [];
  for (let i = 0; i < 15; i += 1) {
    allowed.push((await chat({ cookie: null, ip: "198.51.100.7" })).status);
  }

  const ok = allowed.filter((s) => s === 200).length;
  const limited = allowed.filter((s) => s === 429).length;
  assert.equal(ok, 10, "the chat bucket is 10 per minute");
  assert.equal(limited, 5);
  assert.equal(state().geminiCalls, 10);
});

test("signed-in: the burst window caps a flood from one account", async () => {
  const statuses = [];
  for (let i = 0; i < 13; i += 1) statuses.push((await chat({ userId: USER })).status);

  assert.equal(statuses.filter((s) => s === 200).length, 10);
  assert.equal(statuses.at(-1), 429);
});

test("the burst window buckets guests by IP and users by id", async () => {
  await chat({ ip: "198.51.100.1" });
  await chat({ userId: USER });

  assert.deepEqual(state().seenIdentifiers, ["anon:198.51.100.1", USER]);
});

test("a rate-limited request costs no trial question and no Gemini call", async () => {
  for (let i = 0; i < 10; i += 1) await chat({ cookie: null, ip: "198.51.100.9" });
  state().geminiCalls = 0;

  const blocked = await chat({ cookie: null, ip: "198.51.100.9" });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.retryAfter) > 0, "Retry-After tells the client when to come back");
  assert.equal(blocked.setCookie, null, "no trial was spent");
  assert.equal(state().geminiCalls, 0);
});

test("a spoofed X-Forwarded-For cannot mint a fresh bucket", async () => {
  for (let i = 0; i < 10; i += 1) await chat({ cookie: null, ip: "198.51.100.20" });
  assert.equal((await chat({ cookie: null, ip: "198.51.100.20" })).status, 429);

  // Rotating the caller-written end of the list must change nothing: the entry
  // our own edge appended is the one on the right.
  const statuses = [];
  for (let i = 0; i < 10; i += 1) {
    statuses.push(
      (await chat({ cookie: null, forwardedFor: `10.0.0.${i}, 198.51.100.20` })).status
    );
  }
  assert.ok(
    statuses.every((s) => s === 429),
    "every spoofed request still lands in the real IP's bucket"
  );
  assert.ok(
    state().seenIdentifiers.every((id) => id === "anon:198.51.100.20"),
    "the limiter only ever saw the observed address"
  );
});

test("genuinely different clients still get their own buckets", async () => {
  for (let i = 0; i < 10; i += 1) await chat({ cookie: null, ip: "198.51.100.30" });
  assert.equal((await chat({ cookie: null, ip: "198.51.100.30" })).status, 429);

  assert.equal(
    (await chat({ cookie: null, ip: "198.51.100.31" })).status,
    200,
    "one noisy visitor must not lock everyone else out"
  );
});

// --------------------------------------------------------------------------
// 3. Daily quota for signed-in accounts
// --------------------------------------------------------------------------

test("signed-in: the daily quota blocks once the ledger holds 50", async () => {
  db.seedUsage(IDENTITY, 50, EARLIER);

  const res = await chat({ userId: USER });
  assert.equal(res.status, 429);
  assert.equal(res.json.limitReached, true);
  assert.equal(res.json.dailyLimit, 50);
  assert.equal(res.dailyRemaining, "0");
  assert.ok(Number(res.retryAfter) > 0);
  assert.equal(state().geminiCalls, 0);
  assert.equal(db.countUsage(IDENTITY), 50, "a rejected question reserves nothing");
});

test("signed-in: X-Chat-Daily-Remaining counts down toward the limit", async () => {
  db.seedUsage(IDENTITY, 47, EARLIER);

  const res = await chat({ userId: USER });
  assert.equal(res.status, 200);
  assert.equal(res.dailyRemaining, "2", "3 left before this one, 2 after");
  assert.equal(db.countUsage(IDENTITY), 48, "the question was reserved, not just counted");
});

test("the daily quota only counts the last 24 hours and only this identity", async () => {
  db.seedUsage(IDENTITY, 60, { spreadMs: 1000, endingAt: Date.now() - 48 * 3600_000 });
  db.seedUsage(userIdentity("user_someone_else"), 60, EARLIER);
  db.seedUsage(guestIdentity("203.0.113.10"), 60, EARLIER);

  const res = await chat({ userId: USER });
  assert.equal(res.status, 200, "aged-out and other-identity rows must not count");
  assert.equal(res.dailyRemaining, "49");
});

test("admins are exempt, and spend nothing from the ledger", async () => {
  db.seedUsage(IDENTITY, 200, EARLIER);

  const res = await chat({ userId: USER, role: "admin" });
  assert.equal(res.status, 200);
  assert.equal(res.dailyRemaining, null, "no remaining header for an exempt account");
  assert.equal(db.countUsage(IDENTITY), 200, "an exempt request reserves nothing");
});

test("deleting chat history does NOT reset the daily quota", async () => {
  db.seedUsage(IDENTITY, 50, EARLIER);
  db.seedMessages(USER, 50, EARLIER);
  assert.equal((await chat({ userId: USER })).status, 429);

  // Exactly what DELETE /api/chat/history { all: true } does. It clears the
  // conversation and, with it, chat_messages — but nothing cascades into the
  // ledger, so the usage record survives.
  db.deleteUserHistory(USER);
  resetState({ keepDatabase: true });
  assert.equal(db.countMessages(USER), 0, "the conversation really is gone");

  const res = await chat({ userId: USER });
  assert.equal(res.status, 429, "history is the user's; their usage record is not");
  assert.equal(res.json.limitReached, true);
});

// --------------------------------------------------------------------------
// 4. Guest volume ceiling
// --------------------------------------------------------------------------

test("guests are metered by address once the trial cookie is gone", async () => {
  db.seedUsage(guestIdentity("198.51.100.40"), 30, EARLIER);

  const res = await chat({ cookie: null, ip: "198.51.100.40" });
  assert.equal(res.status, 429);
  assert.equal(res.json.dailyLimit, 30, "guests get their own, separate ceiling");
  assert.equal(state().geminiCalls, 0);

  // An address can be a whole office or campus, so "come back tomorrow" is the
  // wrong advice — an account is an allowance of their own, right now.
  assert.equal(res.json.signUpRequired, true);
  assert.equal(res.json.limitReached, false, "that copy says to wait for the clock");
  assert.equal(res.dailyRemaining, null, "the account quota header is not a guest's");
});

test("a signed-in account exhausted for the day is told to wait, not to sign up", async () => {
  db.seedUsage(IDENTITY, 50, EARLIER);

  const res = await chat({ userId: USER });
  assert.equal(res.json.limitReached, true);
  assert.ok(!res.json.signUpRequired, "they already have an account");
  assert.equal(res.dailyRemaining, "0");
});

test("one guest address does not spend another's allowance", async () => {
  db.seedUsage(guestIdentity("198.51.100.41"), 30, EARLIER);

  assert.equal((await chat({ cookie: null, ip: "198.51.100.41" })).status, 429);
  assert.equal((await chat({ cookie: null, ip: "198.51.100.42" })).status, 200);
});

test("the ledger stores no raw address", async () => {
  await chat({ cookie: null, ip: "198.51.100.43" });

  const identities = db.tables.chat_usage.map((row) => row.identity);
  assert.equal(identities.length, 1);
  assert.match(identities[0], /^ip:[0-9a-f]{64}$/, "a salted digest, not an address");
  assert.ok(!identities[0].includes("198.51.100.43"));
});

// --------------------------------------------------------------------------
// 5. Degraded modes
// --------------------------------------------------------------------------

test("Upstash down: the ledger's burst window takes over for accounts", async () => {
  resetState({ upstash: "error" });
  db.seedUsage(IDENTITY, 10, { spreadMs: 1000, endingAt: Date.now() - 5_000 });

  const res = await chat({ userId: USER });
  assert.equal(res.status, 429);
  assert.equal(res.json.limitReached, false, "burst, not the daily quota");
  assert.equal(state().geminiCalls, 0);
});

test("Upstash down: guests are capped by the ledger too", async () => {
  resetState({ upstash: "error" });

  // The case that used to be wide open: no Upstash, cookie cleared every time,
  // so nothing counted the caller at all.
  const statuses = [];
  for (let i = 0; i < 15; i += 1) statuses.push((await chat({ cookie: null })).status);

  assert.equal(statuses.filter((s) => s === 200).length, 10, "the per-minute ceiling holds");
  assert.equal(statuses.filter((s) => s === 429).length, 5);
  assert.equal(state().geminiCalls, 10);
});

test("Upstash up: the ledger's burst window is not also charged", async () => {
  db.seedUsage(IDENTITY, 40, { spreadMs: 100, endingAt: Date.now() - 1000 });

  // 40 in the last minute, but Upstash is doing the burst work, so only the
  // daily quota (40 of 50) applies.
  const res = await chat({ userId: USER });
  assert.equal(res.status, 200);
  assert.equal(res.dailyRemaining, "9");
});

test("ledger unreachable: a signed-in account still gets answered", async () => {
  db.failQuotaRpc = true;

  const res = await chat({ userId: USER });
  assert.equal(res.status, 200, "a database blip must not take the assistant down");
  assert.equal(res.dailyRemaining, null);
});

test("ledger unreachable AND no Upstash: guests are refused", async () => {
  resetState({ upstash: "error" });
  db.failQuotaRpc = true;

  const res = await chat({ cookie: null });
  assert.equal(res.status, 503, "nothing can meter a guest here, so chat closes");
  assert.equal(res.json.signUpRequired, true);
  assert.equal(state().geminiCalls, 0);

  // ...but only when BOTH are gone. Upstash alone still bounds a guest.
  resetState();
  db.failQuotaRpc = true;
  assert.equal((await chat({ cookie: null })).status, 200);
});

test("message storage down: the question is still charged for", async () => {
  db.failWritesTo = "chat_messages";

  const res = await chat({ userId: USER });
  assert.equal(res.status, 200, "a storage failure must not cost the visitor their answer");
  assert.equal(db.countMessages(USER), 0, "nothing was stored");
  assert.equal(
    db.countUsage(IDENTITY),
    1,
    "but it reached Gemini, so the ledger charged for it anyway"
  );
});

// --------------------------------------------------------------------------
// 6. Ordering and concurrency
// --------------------------------------------------------------------------

test("an empty payload costs a burst token but not a daily question", async () => {
  const res = await chat({ userId: USER, body: { messages: [] } });

  assert.equal(res.status, 400);
  assert.equal(state().seenIdentifiers.length, 1, "the flood guard charges for junk");
  assert.equal(db.countUsage(IDENTITY), 0, "the volume quota does not");
  assert.equal(state().geminiCalls, 0);
});

test("a payload that normalizes to nothing cannot spend a question either", async () => {
  for (const body of [
    {},
    { messages: "not an array" },
    { messages: [{ role: "user", content: "   " }] },
    { messages: [{ role: "assistant", content: "only an assistant turn" }] }
  ]) {
    const res = await chat({ userId: USER, body });
    assert.equal(res.status, 400, `${JSON.stringify(body)} should be rejected`);
  }
  assert.equal(db.countUsage(IDENTITY), 0);
  assert.equal(state().geminiCalls, 0);
});

test("parallel requests cannot overspend the daily quota", async () => {
  db.seedUsage(IDENTITY, 49, EARLIER);
  state().upstash = "error"; // isolate the ledger from the Upstash window

  // The old check read the count, then acted on it: every one of these read 49
  // before any had stored anything, and all went through. The RPC now counts
  // and reserves inside one transaction, serialized per identity.
  const results = await Promise.all(Array.from({ length: 8 }, () => chat({ userId: USER })));

  assert.equal(results.filter((r) => r.status === 200).length, 1, "exactly one slot was left");
  assert.equal(results.filter((r) => r.status === 429).length, 7);
  assert.equal(db.countUsage(IDENTITY), 50, "the account lands exactly on its limit");
  assert.equal(state().geminiCalls, 1);
});

test("a parallel burst from one guest address is bounded too", async () => {
  resetState({ upstash: "error" });

  const results = await Promise.all(
    Array.from({ length: 25 }, () => chat({ cookie: null, ip: "198.51.100.50" }))
  );

  assert.equal(results.filter((r) => r.status === 200).length, 10);
  assert.equal(state().geminiCalls, 10);
});
