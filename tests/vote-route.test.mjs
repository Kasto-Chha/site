// POST /api/votes/{trending,battle,review}, against the real route handlers and
// the fake PostgREST's stand-in for cast_vote.
//
// The SQL itself is tested in vote-sql.test.mjs. This pins the route: that it
// sends exactly one request per vote (the whole transition, so nothing can
// interleave with it), passes the verified Clerk id rather than anything in the
// body, and refuses to fall back to a non-atomic path when the function is
// missing.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { db } from "./support/harness.js";

const USER = "user_2abcTESTclerkid";
const TOPIC = "00000000-0000-4000-8000-000000000001";
const BATTLE = "00000000-0000-4000-8000-000000000002";
const REVIEW = "00000000-0000-4000-8000-000000000003";
const MISSING = "00000000-0000-4000-8000-0000000000ff";

const routes = {};

before(async () => {
  await db.listen();
  process.env.NEXT_PUBLIC_SUPABASE_URL = db.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  globalThis.__KC_TEST__ = { userId: null, roles: {}, cookies: {}, upstash: "on", redis: {}, seenIdentifiers: [] };

  for (const name of ["trending", "battle", "review"]) {
    routes[name] = (await import(`../app/api/votes/${name}/route.js`)).POST;
  }
});

after(() => db.close());

beforeEach(() => {
  db.reset();
  globalThis.__KC_TEST__.userId = USER;
  db.tables.trending_topics.push({ id: TOPIC, votes_yes: 0, votes_mid: 0, votes_no: 0 });
  db.tables.battles.push({ id: BATTLE, left_votes: 0, right_votes: 0 });
  db.tables.reviews.push({ id: REVIEW, upvotes: 0, downvotes: 0 });
});

async function post(route, body) {
  const request = new Request(`https://kastochha.com/api/votes/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
  const response = await routes[route](request);
  return { status: response.status, json: await response.json().catch(() => null) };
}

const rpcCalls = () => db.requests.filter((r) => r.table === "rpc/cast_vote");
const directWrites = () =>
  db.requests.filter((r) => !r.table.startsWith("rpc/") && r.method !== "GET" && r.method !== "HEAD");

test("a vote is one request carrying the verified user id", async () => {
  // A userId in the body is ignored: the ledger row belongs to whoever Clerk
  // says is signed in.
  const res = await post("trending", { id: TOPIC, side: "yes", userId: "someone_else" });

  assert.equal(res.status, 200);
  assert.equal(res.json.vote, "yes");
  assert.equal(res.json.topic.votes_yes, 1);

  assert.equal(db.requests.length, 1, "read, write and counters all in one call");
  assert.deepEqual(rpcCalls()[0].body, {
    p_user_id: USER,
    p_target_type: "trending",
    p_target_id: TOPIC,
    p_value: "yes"
  });
  assert.equal(db.tables.user_votes[0].user_id, USER);
});

test("the same choice again withdraws, and the response says so", async () => {
  await post("trending", { id: TOPIC, side: "yes" });
  const res = await post("trending", { id: TOPIC, side: "yes" });

  assert.equal(res.status, 200);
  assert.equal(res.json.vote, null);
  assert.equal(res.json.topic.votes_yes, 0);
  assert.equal(db.tables.user_votes.length, 0);
});

test("battles and reviews use their own field and result key", async () => {
  const battle = await post("battle", { id: BATTLE, side: "a" });
  assert.equal(battle.status, 200);
  assert.equal(battle.json.battle.left_votes, 1);

  const review = await post("review", { id: REVIEW, direction: "down" });
  assert.equal(review.status, 200);
  assert.equal(review.json.review.downvotes, 1);
  assert.equal(review.json.vote, "down");
});

test("parallel duplicate votes leave the counter equal to the ledger", async () => {
  // The old route made three requests per vote (read, write, counters), so
  // concurrent ones could interleave: several read "no vote yet" and each
  // added one, leaving the counter above the single ledger row it reflects.
  // One request per vote leaves nothing to interleave.
  await Promise.all(Array.from({ length: 6 }, () => post("trending", { id: TOPIC, side: "yes" })));

  const topic = db.tables.trending_topics[0];
  const held = db.tables.user_votes.filter((v) => v.value === "yes").length;
  assert.equal(topic.votes_yes, held, "the counter is exactly what the ledger holds");
  assert.ok(held <= 1, "one user, at most one vote");
});

test("signed out, malformed or oversized requests never reach the database", async () => {
  globalThis.__KC_TEST__.userId = null;
  assert.equal((await post("trending", { id: TOPIC, side: "yes" })).status, 401);

  globalThis.__KC_TEST__.userId = USER;
  assert.equal((await post("trending", { id: "not-a-uuid", side: "yes" })).status, 400);
  assert.equal((await post("trending", { id: TOPIC, side: "up" })).status, 400);
  assert.equal((await post("review", { id: REVIEW, side: "up" })).status, 400, "wrong field name");
  assert.equal((await post("trending", "{not json")).status, 400);

  const huge = await post("trending", { id: TOPIC, side: "yes", pad: "x".repeat(64 * 1024) });
  assert.equal(huge.status, 413);

  assert.equal(db.requests.length, 0);
});

test("a vote on something that does not exist is a 404", async () => {
  const res = await post("trending", { id: MISSING, side: "yes" });
  assert.equal(res.status, 404);
  assert.match(res.json.error, /Topic not found/);
  assert.equal(db.tables.user_votes.length, 0);
});

test("with the migration missing, voting fails rather than going non-atomic", async () => {
  db.missingVoteRpc = true;

  const res = await post("trending", { id: TOPIC, side: "yes" });
  assert.equal(res.status, 500);
  assert.equal(directWrites().length, 0, "no fallback wrote the ledger or counters directly");
  assert.equal(db.tables.trending_topics[0].votes_yes, 0);
});

test("without the service role key, voting refuses instead of using a weaker key", async () => {
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  try {
    const res = await post("trending", { id: TOPIC, side: "yes" });
    assert.equal(res.status, 500);
    assert.equal(db.requests.length, 0);
  } finally {
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  }
});
