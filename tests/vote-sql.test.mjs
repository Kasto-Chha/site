// cast_vote, the real migration SQL, executed against a real Postgres (PGlite).
//
// The vote route tests run a JavaScript stand-in for this function, which
// proves the route calls it correctly but would agree with a typo in the SQL.
// This file runs supabase/migrations/0014_atomic_votes.sql as written, on top
// of the 0003 counter functions it builds on.
//
// What it cannot check is concurrency: PGlite is a single connection, so the
// row lock is never contended here. That the lock is taken is asserted below;
// that it serializes callers is a property of Postgres. What it CAN check is
// the other half of atomicity — that a failure partway through leaves nothing
// behind.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";

let db;

const TOPIC = "00000000-0000-4000-8000-000000000001";
const BATTLE = "00000000-0000-4000-8000-000000000002";
const REVIEW = "00000000-0000-4000-8000-000000000003";
const MISSING = "00000000-0000-4000-8000-0000000000ff";

const migration = (name) =>
  readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

before(async () => {
  db = await PGlite.create();

  // Just enough of the prior schema for 0003 and 0014 to run as written.
  await db.exec(`
    create role service_role;
    create table public.trending_topics (
      id uuid primary key default gen_random_uuid(),
      votes_yes int not null default 0,
      votes_mid int not null default 0,
      votes_no int not null default 0,
      updated_at timestamptz not null default now()
    );
    create table public.battles (
      id uuid primary key default gen_random_uuid(),
      left_votes int not null default 0,
      right_votes int not null default 0
    );
    create table public.reviews (
      id uuid primary key default gen_random_uuid(),
      upvotes int not null default 0,
      downvotes int not null default 0
    );
    create table public.user_votes (
      id uuid primary key default gen_random_uuid(),
      user_id text not null,
      target_type text not null,
      target_id uuid not null,
      value text not null,
      created_at timestamptz not null default now(),
      unique (user_id, target_type, target_id)
    );
  `);

  await db.exec(await migration("0003_vote_changes_and_comment_edits.sql"));
  await db.exec(await migration("0014_atomic_votes.sql"));
});

after(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`
    delete from public.user_votes;
    delete from public.trending_topics;
    delete from public.battles;
    delete from public.reviews;
    insert into public.trending_topics (id) values ('${TOPIC}');
    insert into public.battles (id) values ('${BATTLE}');
    insert into public.reviews (id) values ('${REVIEW}');
  `);
});

async function vote(userId, targetType, targetId, value) {
  const res = await db.query(`select public.cast_vote($1, $2, $3, $4) as result`, [
    userId,
    targetType,
    targetId,
    value
  ]);
  return res.rows[0].result;
}

async function ledger() {
  const res = await db.query(
    `select user_id, target_type, target_id, value from public.user_votes order by user_id`
  );
  return res.rows;
}

async function topic() {
  const res = await db.query(
    `select votes_yes, votes_mid, votes_no from public.trending_topics where id = $1`,
    [TOPIC]
  );
  return res.rows[0];
}

test("a first vote writes one ledger row and moves one counter", async () => {
  const result = await vote("u1", "trending", TOPIC, "yes");

  assert.equal(result.found, true);
  assert.equal(result.vote, "yes");
  assert.equal(result.row.votes_yes, 1, "the updated row comes back with the result");
  assert.deepEqual(await topic(), { votes_yes: 1, votes_mid: 0, votes_no: 0 });
  assert.deepEqual(await ledger(), [
    { user_id: "u1", target_type: "trending", target_id: TOPIC, value: "yes" }
  ]);
});

test("the same choice again withdraws the vote", async () => {
  await vote("u1", "trending", TOPIC, "yes");
  const result = await vote("u1", "trending", TOPIC, "yes");

  assert.equal(result.vote, null);
  assert.deepEqual(await topic(), { votes_yes: 0, votes_mid: 0, votes_no: 0 });
  assert.deepEqual(await ledger(), []);
});

test("a different choice moves the vote across, still one row", async () => {
  await vote("u1", "trending", TOPIC, "yes");
  const result = await vote("u1", "trending", TOPIC, "no");

  assert.equal(result.vote, "no");
  assert.deepEqual(await topic(), { votes_yes: 0, votes_mid: 0, votes_no: 1 });
  assert.equal((await ledger()).length, 1);
  assert.equal((await ledger())[0].value, "no");
});

test("battles and reviews move their own counters", async () => {
  const battle = await vote("u1", "battle", BATTLE, "b");
  assert.equal(battle.row.right_votes, 1);
  assert.equal(battle.row.left_votes, 0);

  const review = await vote("u1", "review", REVIEW, "down");
  assert.equal(review.row.downvotes, 1);

  const flipped = await vote("u1", "review", REVIEW, "up");
  assert.equal(flipped.row.upvotes, 1);
  assert.equal(flipped.row.downvotes, 0);
});

test("users are counted independently", async () => {
  await vote("u1", "trending", TOPIC, "yes");
  await vote("u2", "trending", TOPIC, "yes");
  await vote("u3", "trending", TOPIC, "mid");

  assert.deepEqual(await topic(), { votes_yes: 2, votes_mid: 1, votes_no: 0 });
  assert.equal((await ledger()).length, 3);
});

test("a vote on a target that does not exist writes nothing", async () => {
  const result = await vote("u1", "trending", MISSING, "yes");

  assert.deepEqual(result, { found: false, vote: null, row: null });
  assert.deepEqual(await ledger(), [], "no orphan ledger row");
});

test("a choice the target does not accept is refused, and nothing is written", async () => {
  for (const [type, id, value] of [
    ["review", REVIEW, "yes"],
    ["trending", TOPIC, "up"],
    ["battle", BATTLE, ""],
    ["poll", TOPIC, "yes"]
  ]) {
    await assert.rejects(vote("u1", type, id, value), /not a valid/, `${type}/${value}`);
  }
  await assert.rejects(vote("", "trending", TOPIC, "yes"), /user id is required/);
  assert.deepEqual(await ledger(), []);
});

test("counters always equal the ledger, across any sequence of votes", async () => {
  // The invariant the old read-then-write code could break under concurrency:
  // every counter is exactly the number of ledger rows holding that choice.
  const users = ["u1", "u2", "u3", "u4"];
  const choices = ["yes", "mid", "no"];
  let seed = 7;
  const next = (n) => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed % n;
  };

  for (let i = 0; i < 120; i += 1) {
    await vote(users[next(users.length)], "trending", TOPIC, choices[next(choices.length)]);

    const rows = await ledger();
    const counts = { votes_yes: 0, votes_mid: 0, votes_no: 0 };
    for (const row of rows) counts[`votes_${row.value}`] += 1;
    assert.deepEqual(await topic(), counts, `diverged after vote ${i + 1}`);
  }
});

test("a failure after the ledger moved rolls the ledger back too", async () => {
  // Make the counter update itself fail — the step that runs after the ledger
  // write. The old code needed a best-effort compensation call for this; in one
  // transaction there is nothing to compensate.
  await db.exec(`
    alter table public.trending_topics
      add constraint test_counter_frozen check (votes_yes = 0)
  `);
  try {
    await assert.rejects(vote("u1", "trending", TOPIC, "yes"), /test_counter_frozen/);
    assert.deepEqual(await ledger(), [], "the ledger write was rolled back with it");
  } finally {
    await db.exec(`alter table public.trending_topics drop constraint test_counter_frozen`);
  }
});

test("the target row is locked before the ledger is read", async () => {
  const res = await db.query(`select prosrc from pg_proc where proname = 'cast_vote'`);
  const source = res.rows[0].prosrc;

  for (const table of ["trending_topics", "battles", "reviews"]) {
    assert.match(
      source,
      new RegExp(`from public\\.${table} where id = p_target_id for update`),
      `${table} is locked — what serializes concurrent votes on one target`
    );
  }
  assert.ok(
    source.indexOf("for update") < source.indexOf("from public.user_votes"),
    "the lock comes before the previous vote is read"
  );
});

test("the function is invoker-rights and not callable by public", async () => {
  const res = await db.query(`
    select p.prosecdef,
           has_function_privilege('public', p.oid, 'execute') as public_can_execute,
           has_function_privilege('service_role', p.oid, 'execute') as service_can_execute
      from pg_proc p
     where p.proname = 'cast_vote'
  `);

  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0].prosecdef, false, "security invoker");
  assert.equal(res.rows[0].public_can_execute, false, "p_user_id is trusted, so revoked from public");
  assert.equal(res.rows[0].service_can_execute, true);
});

test("the migration is safe to replay", async () => {
  await db.exec(await migration("0014_atomic_votes.sql"));
  const result = await vote("u1", "trending", TOPIC, "mid");
  assert.equal(result.vote, "mid");
});
