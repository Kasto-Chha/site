// Migration 0016, the real SQL, executed against a real Postgres (PGlite).
//
// The route and ranking tests run against a JavaScript stand-in for the
// database, which would agree with a typo in the migration. This file runs
// supabase/migrations/0016_trending_searches.sql as written, on top of the
// 0004 chat tables it alters, and checks the part that cannot be undone if it
// is wrong: the backfill of opening_query from conversations that already
// exist.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";

import { topicTitle } from "../lib/chatTopics.js";

let db;

const migration = (name) =>
  readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

const RENAMED = "00000000-0000-4000-8000-000000000001";
const LONG = "00000000-0000-4000-8000-000000000002";
const NO_TURNS = "00000000-0000-4000-8000-000000000003";
const BLANK_TURN = "00000000-0000-4000-8000-000000000004";
const FOLLOW_UPS = "00000000-0000-4000-8000-000000000005";
const EXACTLY_80 = "00000000-0000-4000-8000-000000000006";

const MESSY = "  BYD   ko gaadi\n\tkasto chha?  ";
const LONG_QUESTION = `Kathmandu ma ${"dherai lamo prashna ".repeat(12)}kasto chha?`;
const EIGHTY = "x".repeat(80);

before(async () => {
  db = await PGlite.create();
  await db.exec(await migration("0004_chat_topics.sql"));

  // Conversations as they exist before 0016: titled, some renamed, with
  // whatever turns were stored.
  await db.exec(`
    insert into public.chat_topics (id, user_id, title) values
      ('${RENAMED}',    'u1', 'my salary notes'),
      ('${LONG}',       'u2', 'whatever it was titled'),
      ('${NO_TURNS}',   'u3', 'title is all that is left'),
      ('${BLANK_TURN}', null, 'kept its title'),
      ('${FOLLOW_UPS}', 'u4', 'renamed too'),
      ('${EXACTLY_80}', 'u5', 'eighty');
  `);

  const turn = (topic, role, content, minutesAgo) =>
    db.query(
      `insert into public.chat_messages (topic_id, role, content, created_at)
       values ($1, $2, $3, now() - ($4 || ' minutes')::interval)`,
      [topic, role, content, String(minutesAgo)]
    );

  await turn(RENAMED, "user", MESSY, 10);
  await turn(RENAMED, "assistant", "Ramro chha.", 9);
  await turn(LONG, "user", LONG_QUESTION, 10);
  await turn(BLANK_TURN, "user", "   \n ", 10);
  await turn(BLANK_TURN, "assistant", "Hajur?", 9);
  // Inserted out of order: the first turn is the oldest, not the first row.
  await turn(FOLLOW_UPS, "user", "ani Pro Max?", 5);
  await turn(FOLLOW_UPS, "assistant", "the answer that came before any stored question", 30);
  await turn(FOLLOW_UPS, "user", "iPhone 17 ko price", 20);
  await turn(EXACTLY_80, "user", EIGHTY, 10);

  await db.exec(await migration("0016_trending_searches.sql"));
});

after(async () => {
  await db?.close();
});

async function openingQuery(id) {
  const res = await db.query(`select opening_query from public.chat_topics where id = $1`, [id]);
  return res.rows[0].opening_query;
}

test("a renamed conversation gets back the question it was opened with", async () => {
  assert.equal(await openingQuery(RENAMED), "BYD ko gaadi kasto chha?");
});

test("the backfill shapes a question exactly the way topicTitle does", async () => {
  // The ranking compares old rows with new ones, so the two have to agree on
  // whitespace and on where, and how, a long question is cut.
  assert.equal(await openingQuery(RENAMED), topicTitle(MESSY));
  assert.equal(await openingQuery(LONG), topicTitle(LONG_QUESTION));
  assert.equal(await openingQuery(EXACTLY_80), topicTitle(EIGHTY));

  const long = await openingQuery(LONG);
  assert.equal([...long].length, 80);
  assert.ok(long.endsWith("…"));
  assert.equal(await openingQuery(EXACTLY_80), EIGHTY, "80 characters fit; nothing is cut");
});

test("the opening question is the earliest user turn, not a follow-up", async () => {
  assert.equal(await openingQuery(FOLLOW_UPS), "iPhone 17 ko price");
});

test("with no usable turn, the title is the best that is left", async () => {
  assert.equal(await openingQuery(NO_TURNS), "title is all that is left");
  assert.equal(await openingQuery(BLANK_TURN), "kept its title");
});

test("old rows are left unmarked: typed, and not told apart as guests", async () => {
  const res = await db.query(
    `select count(*)::int as n from public.chat_topics
      where source is not null or guest_key is not null`
  );
  assert.equal(res.rows[0].n, 0);
});

test("replaying the migration overwrites nothing and fills what is new", async () => {
  await db.query(`update public.chat_topics set opening_query = 'set by the app' where id = $1`, [
    RENAMED
  ]);
  // A conversation the old code created after the first run: no opening_query.
  const late = "00000000-0000-4000-8000-0000000000aa";
  await db.query(`insert into public.chat_topics (id, user_id, title) values ($1, 'u9', 'late')`, [
    late
  ]);
  await db.query(
    `insert into public.chat_messages (topic_id, role, content) values ($1, 'user', 'Deepal S07')`,
    [late]
  );

  await db.exec(await migration("0016_trending_searches.sql"));

  assert.equal(await openingQuery(RENAMED), "set by the app");
  assert.equal(await openingQuery(LONG), topicTitle(LONG_QUESTION));
  assert.equal(await openingQuery(late), "Deepal S07");
});

test("a rule is 'hide' or 'fallback' and nothing else", async () => {
  await db.exec(`
    insert into public.trending_search_rules (term, action) values ('momo', 'hide');
    insert into public.trending_search_rules (term, action, rank) values ('ABC Trek', 'fallback', 2);
    insert into public.trending_search_rules (term) values ('defaults to hide');
  `);
  await assert.rejects(
    db.exec(`insert into public.trending_search_rules (term, action) values ('x', 'promote')`),
    /check constraint/i
  );
  await assert.rejects(
    db.exec(`insert into public.trending_search_rules (action) values ('hide')`),
    /null value/i
  );

  const res = await db.query(
    `select term, action, rank from public.trending_search_rules order by rank, term`
  );
  assert.deepEqual(res.rows, [
    { term: "defaults to hide", action: "hide", rank: 1 },
    { term: "momo", action: "hide", rank: 1 },
    { term: "ABC Trek", action: "fallback", rank: 2 }
  ]);
});

test("the rules table is closed to the publishable key", async () => {
  const res = await db.query(`
    select c.relrowsecurity as rls,
           (select count(*)::int from pg_policies p
             where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c
     where c.oid = 'public.trending_search_rules'::regclass
  `);
  // RLS on and no policy: only the service role, which bypasses RLS, gets in.
  assert.deepEqual(res.rows[0], { rls: true, policies: 0 });
});
