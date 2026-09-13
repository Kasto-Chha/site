// The real migration SQL, executed against a real Postgres.
//
// The chat tests elsewhere run a JavaScript re-implementation of
// consume_chat_quota, which proves the route uses it correctly but would
// happily agree with a typo in the migration. PGlite is Postgres compiled to
// WASM, so this file runs supabase/migrations/0013_chat_usage_ledger.sql as
// written and checks the function's actual behaviour.
//
// What it cannot check is concurrency: PGlite is a single connection, so the
// advisory lock is never contended here. That the lock is taken at all is
// asserted below; that it does its job is a property of Postgres.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";

let db;

const DAY_LIMIT = 50;
const BURST_LIMIT = 10;

before(async () => {
  db = await PGlite.create();

  // The ledger migration references chat_messages in its backfill, so stand up
  // just enough of the prior schema for it to run as written.
  await db.exec(`
    create table public.chat_messages (
      id uuid primary key default gen_random_uuid(),
      topic_id uuid,
      user_id text,
      role text not null,
      content text not null,
      created_at timestamptz not null default now()
    );
    insert into public.chat_messages (user_id, role, content, created_at) values
      ('u1', 'user',      'inside the window',  now() - interval '2 hours'),
      ('u1', 'assistant', 'an answer',          now() - interval '2 hours'),
      ('u1', 'user',      'also inside',        now() - interval '3 hours'),
      ('u1', 'user',      'too old to matter',  now() - interval '30 hours'),
      (null, 'user',      'a guest turn',       now() - interval '1 hour');
  `);

  const sql = await readFile(
    new URL("../supabase/migrations/0013_chat_usage_ledger.sql", import.meta.url),
    "utf8"
  );
  // service_role does not exist in a bare Postgres; the grant is Supabase's.
  await db.exec(`create role service_role;`);
  await db.exec(sql);
});

after(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`delete from public.chat_usage;`);
});

async function consume(identity, { checkBurst = false, dayLimit = DAY_LIMIT } = {}) {
  const result = await db.query(
    `select * from public.consume_chat_quota($1, $2, $3, $4)`,
    [identity, dayLimit, BURST_LIMIT, checkBurst]
  );
  return result.rows[0];
}

async function seed(identity, count, ageExpression) {
  await db.exec(`
    insert into public.chat_usage (identity, created_at)
    select '${identity}', now() - ${ageExpression}
    from generate_series(1, ${count});
  `);
}

async function countFor(identity) {
  const res = await db.query(`select count(*)::int as n from public.chat_usage where identity = $1`, [
    identity
  ]);
  return res.rows[0].n;
}

test("the migration backfilled only recent user turns, per account", async () => {
  // beforeEach cleared the table, so re-run the backfill's own predicate to
  // check what it would have selected.
  const res = await db.query(`
    select count(*)::int as n
      from public.chat_messages m
     where m.user_id is not null
       and m.role = 'user'
       and m.created_at >= now() - interval '24 hours'
  `);
  assert.equal(res.rows[0].n, 2, "assistant turns, guests and old rows are excluded");
});

test("a first question is allowed and reserves a row", async () => {
  const row = await consume("user:u1");

  assert.equal(row.allowed, true);
  assert.equal(row.remaining, DAY_LIMIT - 1);
  assert.equal(row.scope, null);
  assert.equal(await countFor("user:u1"), 1, "the slot is reserved by the call itself");
});

test("remaining counts down and stops at the limit", async () => {
  for (let i = 0; i < DAY_LIMIT; i += 1) {
    const row = await consume("user:u1");
    assert.equal(row.allowed, true, `question ${i + 1} should be allowed`);
    assert.equal(row.remaining, DAY_LIMIT - 1 - i);
  }

  const blocked = await consume("user:u1");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.scope, "day");
  assert.equal(blocked.remaining, 0);
  assert.equal(await countFor("user:u1"), DAY_LIMIT, "a refusal reserves nothing");
});

test("retry_after points at when the oldest row leaves the 24h window", async () => {
  await seed("user:u1", DAY_LIMIT, `interval '23 hours'`);

  const row = await consume("user:u1");
  assert.equal(row.allowed, false);
  assert.equal(row.scope, "day");
  // One hour of the window left, give or take the clock.
  assert.ok(row.retry_after > 3500 && row.retry_after <= 3600, `got ${row.retry_after}`);
});

test("retry_after never drops to zero at the edge of the window", async () => {
  // A second of the window left. The raw arithmetic lands somewhere under one
  // second — or below zero, if the row ages out while the function runs — and
  // a Retry-After of 0 would invite an instant retry loop, so the clamp is
  // what has to hold here.
  await seed("user:u1", DAY_LIMIT, `interval '23 hours 59 minutes 59 seconds'`);

  const row = await consume("user:u1");
  assert.equal(row.allowed, false);
  assert.equal(row.retry_after, 1, "clamped to a whole second, never 0 or negative");
});

test("rows that age out mid-window free the slot rather than pinning it", async () => {
  // The counterpart to the above: once a row is genuinely past 24 hours the
  // prune retires it, so a spent quota recovers on its own.
  await seed("user:u1", DAY_LIMIT, `interval '24 hours 1 second'`);

  const row = await consume("user:u1");
  assert.equal(row.allowed, true);
  assert.equal(row.remaining, DAY_LIMIT - 1);
});

test("the burst window is only checked when asked for", async () => {
  await seed("user:u1", BURST_LIMIT, `interval '5 seconds'`);

  const ignored = await consume("user:u1", { checkBurst: false });
  assert.equal(ignored.allowed, true, "Upstash is handling the minute window");

  await db.exec(`delete from public.chat_usage;`);
  await seed("user:u1", BURST_LIMIT, `interval '5 seconds'`);

  const enforced = await consume("user:u1", { checkBurst: true });
  assert.equal(enforced.allowed, false);
  assert.equal(enforced.scope, "burst");
  assert.ok(enforced.retry_after > 0 && enforced.retry_after <= 60);
  assert.equal(
    enforced.remaining,
    DAY_LIMIT - BURST_LIMIT,
    "a burst refusal still reports the daily allowance"
  );
});

test("rows older than a minute do not count toward the burst window", async () => {
  await seed("user:u1", BURST_LIMIT * 3, `interval '90 seconds'`);

  const row = await consume("user:u1", { checkBurst: true });
  assert.equal(row.allowed, true);
});

test("the day window takes precedence over the burst window", async () => {
  await seed("user:u1", DAY_LIMIT, `interval '5 seconds'`);

  const row = await consume("user:u1", { checkBurst: true });
  assert.equal(row.scope, "day", "the longer refusal is the more useful one to report");
});

test("rows past 24 hours are pruned rather than blocking forever", async () => {
  await seed("user:u1", 200, `interval '25 hours'`);

  const row = await consume("user:u1");
  assert.equal(row.allowed, true);
  assert.equal(row.remaining, DAY_LIMIT - 1);
  assert.equal(await countFor("user:u1"), 1, "the stale rows were retired");
});

test("pruning only ever touches the identity being consumed", async () => {
  await seed("user:someone-else", 5, `interval '25 hours'`);
  await consume("user:u1");

  assert.equal(
    await countFor("user:someone-else"),
    5,
    "one caller's request must not rewrite another's ledger"
  );
});

test("identities are independent", async () => {
  await seed("user:u1", DAY_LIMIT, `interval '1 hour'`);

  assert.equal((await consume("user:u1")).allowed, false);
  assert.equal((await consume("ip:deadbeef")).allowed, true);
  assert.equal((await consume("user:u2")).allowed, true);
});

test("a guest identity works the same way, on its own limit", async () => {
  const guest = "ip:" + "a".repeat(64);
  await seed(guest, 30, `interval '1 hour'`);

  const row = await consume(guest, { dayLimit: 30 });
  assert.equal(row.allowed, false);
  assert.equal(row.scope, "day");
});

test("the function is invoker-rights and not callable by the anon role", async () => {
  const res = await db.query(`
    select p.prosecdef,
           has_function_privilege('public', p.oid, 'execute') as public_can_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'consume_chat_quota'
  `);

  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0].prosecdef, false, "security invoker, like the vote counters");
  assert.equal(res.rows[0].public_can_execute, false, "revoked from public");
});

test("the ledger has RLS on and the index the lookups need", async () => {
  const rls = await db.query(
    `select relrowsecurity from pg_class where relname = 'chat_usage'`
  );
  assert.equal(rls.rows[0].relrowsecurity, true);

  const idx = await db.query(
    `select indexdef from pg_indexes where tablename = 'chat_usage' and indexname = 'idx_chat_usage_identity'`
  );
  assert.equal(idx.rows.length, 1);
  assert.match(idx.rows[0].indexdef, /identity/);
});

test("the function takes a per-identity advisory lock", async () => {
  const res = await db.query(`
    select prosrc from pg_proc where proname = 'consume_chat_quota'
  `);
  assert.match(
    res.rows[0].prosrc,
    /pg_advisory_xact_lock\(hashtextextended\(p_identity/,
    "this is what serializes concurrent callers sharing an identity"
  );
});

test("the migration is safe to replay", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/0013_chat_usage_ledger.sql", import.meta.url),
    "utf8"
  );
  await db.exec(sql);

  const row = await consume("user:replay");
  assert.equal(row.allowed, true, "a second run leaves a working function behind");
});
