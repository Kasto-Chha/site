// Patch 14h: profile health, 22 checks typed in by hand.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const H = await import("../lib/sync/health.js");
const { PUT: putRoute, POST: postRoute } = await import("../app/api/admin/sync/merchants/[id]/health/route.js");
const read = (file) => fs.readFileSync(file, "utf8");

const GOOD = { name: "yes", contact: "all", website: "yes", category: "yes", hours: "full", festival: "yes", closures: "yes", description: "yes", extraCategories: 3, services: "yes", photos: 14, photoAgeDays: 20, logo: "yes", menuPhoto: "yes", rating: 4.6, reviews: 87, waiting: 0, replies: "fast", postDays: 5, offer: "yes", postsMonth: 5, postLink: "yes" };

// ---------- the rules ----------

test("there are 22 checks in 6 groups, and every question belongs to a check", () => {
  assert.equal(H.CHECK_KEYS.length, 22);
  assert.equal(new Set(H.CHECK_KEYS).size, 22);
  assert.equal(H.GROUPS.length, 6);
  assert.equal(H.QUESTIONS.length, 22);
  assert.equal(new Set(H.FACT_KEYS).size, 22);
  const r = H.evaluate({});
  assert.equal(r.total, 22);
  assert.equal(r.groups.reduce((n, g) => n + g.total, 0), 22);
});

test("every check passes on good answers and fails on bad ones", () => {
  const all = H.evaluate(GOOD);
  assert.equal(all.passing, 22);
  assert.equal(all.score, 100);
  const bad = { name: "extra", contact: "partial", website: "no", category: "no", hours: "partial", festival: "no", closures: "no", description: "no", extraCategories: 1, services: "no", photos: 4, photoAgeDays: 200, logo: "no", menuPhoto: "no", rating: 3.9, reviews: 19, waiting: 2, replies: "slowly", postDays: 31, offer: "no", postsMonth: 3, postLink: "no" };
  const r = H.evaluate(bad);
  assert.equal(r.failing, 22);
  assert.equal(r.score, 0);
  // the edges
  assert.equal(H.evaluate({ ...GOOD, photos: 10 }).results.find((c) => c.key === "photos").state, "pass");
  assert.equal(H.evaluate({ ...GOOD, photos: 9 }).results.find((c) => c.key === "photos").state, "fix");
  assert.equal(H.evaluate({ ...GOOD, rating: 4 }).results.find((c) => c.key === "rating").state, "pass");
  assert.equal(H.evaluate({ ...GOOD, reviews: 20 }).results.find((c) => c.key === "reviewCount").state, "pass");
  assert.equal(H.evaluate({ ...GOOD, postDays: 30 }).results.find((c) => c.key === "recentPost").state, "pass");
  assert.equal(H.evaluate({ ...GOOD, photoAgeDays: 90 }).results.find((c) => c.key === "recentPhoto").state, "pass");
});

test("a question left empty is unknown: it neither helps nor hurts the score", () => {
  const r = H.evaluate({ website: "yes", category: "no" });
  assert.equal(r.known, 2);
  assert.equal(r.unknown, 20);
  assert.equal(r.score, 50);
  assert.equal(H.evaluate({}).score, null);
});

test("no photos at all means the recent-photo check fails, whatever its own answer", () => {
  const r = H.evaluate({ photos: 0 });
  assert.equal(r.results.find((c) => c.key === "recentPhoto").state, "fix");
  assert.equal(r.results.find((c) => c.key === "photos").state, "fix");
});

test("answers are checked: bad ones are named, blanks mean not known, inherited keys are ignored", () => {
  assert.deepEqual(H.cleanHealthFacts({ website: "yes", photos: "1,200", rating: "4.5", reviews: "", name: "" }).facts, { website: "yes", photos: 1200, rating: 4.5 });
  for (const bad of [{ website: "maybe" }, { photos: "-1" }, { photos: "1.5" }, { photos: "abc" }, { rating: "5.5" }, { rating: "4.55" }, { postDays: "1000" }, { extraCategories: "10" }, [1], "x"]) assert.ok(H.cleanHealthFacts(bad).error, JSON.stringify(bad));
  assert.deepEqual(H.cleanHealthFacts(JSON.parse('{"__proto__":{"website":"yes"}}')).facts, {});
  assert.deepEqual(H.cleanHealthFacts(null).facts, {});
});

test("a task from a gap names the check and carries the fix", () => {
  const gap = H.gaps({ festival: "no" })[0];
  const task = H.taskFor(gap);
  assert.equal(task.title, "Profile health: Festival and special hours are set");
  assert.equal(task.type, "holiday");
  assert.ok(task.details.length > 10);
});

// ---------- the routes ----------

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
const as = (userId, role) => { globalThis.__KC_TEST__ = { userId, roles: userId ? { [userId]: role } : {}, cookies: {}, revalidatedPaths: [] }; };
const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const seed = (id = ID, extra = {}) => fake.tables.sync_merchants.push({ id, slug: `b-${id.slice(0, 4)}`, topic_slug: `t-${id.slice(0, 4)}`, business_name: "Himal Brew House", area: "Jhamsikhel", status: "active", ...extra });
beforeEach(() => { fake.reset(); as("user_admin", "admin"); seed(); });
const send = async (route, method, b, id = ID) => { const r = await route(new Request("https://www.kastochhanepal.com/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(b) }), { params: { id } }); return { status: r.status, body: await r.json() }; };
const put = (b, id) => send(putRoute, "PUT", b, id);
const post = (b, id) => send(postRoute, "POST", b, id);
const checks = () => fake.tables.sync_health_checks;
const tasks = () => fake.tables.sync_tasks;
const BAD = { facts: { website: "no", festival: "no", photos: "4", rating: "4.6" } };

test("an admin saves a check; the counts are worked out on the server, and every save adds a row", async () => {
  const r = await put({ facts: { ...BAD.facts }, passing: 99, failing: 0, score: 100 });
  assert.equal(r.status, 200);
  assert.equal(r.body.score, 25);
  assert.equal(checks().length, 1);
  assert.equal(checks()[0].passing, 1);
  assert.equal(checks()[0].failing, 3);
  assert.equal(checks()[0].unknown, 18);
  assert.equal(checks()[0].checked_by, "user_admin");
  await put({ facts: { website: "yes" } });
  assert.equal(checks().length, 2, "history, not replaced");
  const listed = await H.listChecks((await import("../lib/supabase/server.js")).createServerSupabase(), ID);
  assert.equal(listed.length, 2);
});

test("the audit log keeps counts and the score, never the answers", async () => {
  await put({ facts: { ...BAD.facts, name: "extra" } });
  const log = JSON.stringify(fake.tables.admin_audit_log);
  assert.ok(log.includes("sync.health.save"));
  for (const secret of ["extra", "festival", "4.6", "website"]) assert.ok(!log.includes(secret), secret);
});

test("a bad or empty check changes nothing and writes no log entry", async () => {
  for (const bad of [{ facts: { website: "maybe" } }, { facts: {} }, { facts: { photos: "-1" } }, {}, { facts: [1] }]) assert.equal((await put(bad)).status, 400, JSON.stringify(bad));
  assert.equal(checks().length, 0);
  assert.equal(fake.tables.admin_audit_log.length, 0);
  assert.equal((await put(BAD, "not-a-uuid")).status, 400);
  assert.equal((await put(BAD, OTHER)).status, 404);
});

test("if the audit log cannot be written, nothing is saved or made", async () => {
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await put(BAD)).status, 500);
  fake.failWritesTo = null;
  assert.equal(checks().length, 0);
  await put(BAD);
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await post({ keys: "all" })).status, 500);
  fake.failWritesTo = null;
  assert.equal(tasks().length, 0);
});

test("tasks come only from the gaps of the latest check, and pressing twice never doubles them", async () => {
  assert.equal((await post({ keys: "all" })).status, 409, "no check yet");
  await put(BAD);
  const one = await post({ keys: ["festival"] });
  assert.deepEqual(one.body, { ok: true, created: 1, skipped: 0 });
  assert.equal(tasks().length, 1);
  assert.equal(tasks()[0].title, "Profile health: Festival and special hours are set");
  assert.equal(tasks()[0].merchant_id, ID);
  const again = await post({ keys: ["festival"] });
  assert.deepEqual(again.body, { ok: true, created: 0, skipped: 1 });
  assert.equal(tasks().length, 1);
  const all = await post({ keys: "all" });
  assert.equal(all.body.created, 2, "website and photos; festival already has one");
  assert.equal(all.body.skipped, 1);
  assert.equal(tasks().length, 3);
  // a check that passes is never made into a task, whatever the browser sends
  const pass = await post({ keys: ["rating"] });
  assert.equal(pass.body.created, 0);
  assert.equal(tasks().length, 3);
  // a finished task no longer blocks a new one
  tasks()[0].status = "done";
  assert.equal((await post({ keys: ["festival"] })).body.created, 1);
});

test("task keys are checked", async () => {
  await put(BAD);
  for (const bad of [{ keys: ["nope"] }, { keys: [] }, { keys: "some" }, {}, { keys: [1] }]) assert.equal((await post(bad)).status, 400, JSON.stringify(bad));
  assert.equal(tasks().length, 0);
  assert.ok(JSON.stringify(fake.tables.admin_audit_log).includes("sync.health.save"));
});

test("the task log names the checks, never the answers", async () => {
  await put(BAD);
  await post({ keys: "all" });
  const log = fake.tables.admin_audit_log.map((e) => JSON.stringify(e)).join("");
  assert.ok(log.includes("sync.health.tasks"));
  assert.ok(!log.includes("Profile health:"), "no task text");
});

test("signed out and ordinary users are refused", async () => {
  for (const [who, role, status] of [[null, null, 401], ["user_c", "user", 403]]) {
    as(who, role);
    assert.equal((await put(BAD)).status, status);
    assert.equal((await post({ keys: "all" })).status, status);
  }
  assert.equal(checks().length, 0);
});

test("an operator works only on an assigned business; an unassigned one looks like it does not exist", async () => {
  as("user_op", "operator");
  assert.equal((await put(BAD)).status, 404);
  assert.equal((await post({ keys: "all" })).status, 404);
  fake.tables.sync_operator_assignments.push({ operator_user_id: "user_op", merchant_id: ID });
  assert.equal((await put(BAD)).status, 200);
  assert.equal((await post({ keys: "all" })).status, 200);
  seed(OTHER);
  assert.equal((await put(BAD, OTHER)).status, 404);
});

test("a Free business is held, an unreadable stage never blocks", async () => {
  fake.reset(); as("user_admin", "admin");
  seed(ID, { stage: "free", trial_started_on: "2026-01-01", trial_ends_on: "2026-04-01" });
  const r = await put(BAD);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Free plan/);
  assert.equal((await post({ keys: "all" })).status, 409);
  assert.equal(checks().length, 0);
  fake.reset(); as("user_admin", "admin");
  seed();
  assert.equal((await put(BAD)).status, 200, "no stage row: not blocked");
});

// ---------- the screen and the files ----------

test("the Google tab shows profile health with a link to the full view, and the audit score is kept on its own scale", () => {
  const page = read("app/admin/sync/[id]/page.js");
  assert.match(page, /Profile health/);
  assert.match(page, /view=health/);
  assert.match(page, /Has migration 0031 been run\?/);
  assert.match(page, /different scale/);
  const client = read("app/admin/sync/[id]/HealthPanel.js");
  assert.match(client, /Make tasks from all gaps/);
  assert.match(client, /Check again/);
  assert.ok(!/window\.(confirm|alert|prompt)/.test(client));
  assert.ok(!/dangerouslySetInnerHTML/.test(client));
  assert.ok(!/<nav[\s>]/.test(client));
});

test("the migration adds one private table tied to its business and is safe to replay", () => {
  const sql = read("supabase/migrations/0031_sync_health_checks.sql").replace(/--.*$/gm, "");
  assert.match(sql, /create table if not exists public\.sync_health_checks/i);
  assert.match(sql, /references public\.sync_merchants\(id\) on delete cascade/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.sync_health_checks from anon, authenticated/i);
  assert.ok(!/drop\s|delete\s+from|truncate/i.test(sql));
  const book = read("docs/sync/runbook.md");
  assert.match(book, /0031_sync_health_checks\.sql/);
  assert.match(book, /### Profile health/);
});
