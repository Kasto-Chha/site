// Patch 14g: the Google tab and the monthly Google numbers typed in by hand.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const G = await import("../lib/sync/googleNumbers.js");
const { PUT: putRoute, DELETE: deleteRoute } = await import("../app/api/admin/sync/merchants/[id]/numbers/route.js");
const read = (file) => fs.readFileSync(file, "utf8");
const TODAY = "2026-11-17";

// ---------- the rules ----------

test("a month is YYYY-MM, never in the future, never before 2020", () => {
  assert.equal(G.parseMonth("2026-10"), "2026-10-01");
  assert.equal(G.parseMonth("2026-10-01"), "2026-10-01");
  for (const bad of ["", "2026-13", "2026-00", "2019-12", "2026-10-15", "October", "26-10", null, undefined, "2026-1"]) assert.equal(G.parseMonth(bad), null, String(bad));
  assert.equal(G.monthLabel("2026-10-01"), "October 2026");
  assert.ok(G.cleanNumbers({ month: "2026-12", calls: 1 }, TODAY).error, "a month that has not happened");
  assert.ok(!G.cleanNumbers({ month: "2026-11", calls: 1 }, TODAY).error, "this month is allowed");
});

test("the months offered run from this month back, newest first", () => {
  const options = G.monthOptions(TODAY);
  assert.equal(options[0].value, "2026-11");
  assert.equal(options[1].value, "2026-10");
  assert.equal(options.length, 36);
  assert.equal(G.lastMonth(TODAY), "2026-10");
  assert.equal(G.lastMonth("2027-01-05"), "2026-12", "across a year");
  assert.equal(new Set(options.map((o) => o.value)).size, 36);
});

test("the figures are whole numbers (commas allowed), blanks mean not known, and at least one is needed", () => {
  const ok = G.cleanNumbers({ month: "2026-10", calls: "128", directions: "342", views: "6,140", rating: "4.6", reviews: "87", note: "  Down a little  in week one. " }, TODAY);
  assert.deepEqual(ok.values, { month: "2026-10-01", calls: 128, directions: 342, profile_views: 6140, rating: 4.6, reviews: 87, note: "Down a little in week one." });
  const partial = G.cleanNumbers({ month: "2026-10", calls: "5", directions: "", rating: "" }, TODAY).values;
  assert.equal(partial.directions, null);
  assert.equal(partial.rating, null);
  for (const input of [{ month: "2026-10" }, { month: "2026-10", calls: "", rating: "" }]) assert.ok(G.cleanNumbers(input, TODAY).error, JSON.stringify(input));
  assert.equal(G.cleanNumbers({ month: "2026-10", calls: 0 }, TODAY).values.calls, 0, "zero is a figure");
});

test("a bad figure is named and refused", () => {
  for (const bad of [{ calls: "-1" }, { calls: "1.5" }, { calls: "abc" }, { calls: "1000001" }, { views: "100000001" }, { rating: "5.1" }, { rating: "4.55" }, { rating: "-1" }, { rating: "x" }, { reviews: "12e3" }]) assert.ok(G.cleanNumbers({ month: "2026-10", ...bad }, TODAY).error, JSON.stringify(bad));
  assert.ok(G.cleanNumbers({ month: "2026-10", calls: 1, note: "x".repeat(301) }, TODAY).error);
  assert.ok(G.cleanNumbers(null, TODAY).error && G.cleanNumbers([1], TODAY).error && G.cleanNumbers("x", TODAY).error);
  assert.match(G.cleanNumbers({ month: "2026-10", calls: "abc" }, TODAY).error, /Calls/);
});

// ---------- the route ----------

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
const as = (userId, role) => { globalThis.__KC_TEST__ = { userId, roles: userId ? { [userId]: role } : {}, cookies: {}, revalidatedPaths: [] }; };
const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const seed = (id = ID, extra = {}) => fake.tables.sync_merchants.push({ id, slug: `b-${id.slice(0, 4)}`, topic_slug: `t-${id.slice(0, 4)}`, business_name: "Himal Brew House", area: "Jhamsikhel", status: "active", ...extra });
beforeEach(() => { fake.reset(); as("user_admin", "admin"); seed(); });
const body = { month: "2026-10", calls: "128", directions: "342", views: "6,140", rating: "4.6", reviews: "87", note: "" };
const put = async (b = body, id = ID) => { const r = await putRoute(new Request("https://www.kastochhanepal.com/x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }), { params: { id } }); return { status: r.status, body: await r.json() }; };
const del = async (month, id = ID) => { const r = await deleteRoute(new Request(`https://www.kastochhanepal.com/x?month=${month}`, { method: "DELETE" }), { params: { id } }); return { status: r.status, body: await r.json() }; };
const rows = () => fake.tables.sync_google_numbers;

test("an admin saves a month, and typing it again replaces it", async () => {
  assert.deepEqual((await put()).body, { ok: true, replaced: false });
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].profile_views, 6140);
  assert.equal(rows()[0].entered_by, "user_admin");
  assert.deepEqual((await put({ ...body, calls: "130" })).body, { ok: true, replaced: true });
  assert.equal(rows().length, 1, "replaced, not added");
  assert.equal(rows()[0].calls, 130);
  await put({ ...body, month: "2026-09" });
  assert.equal(rows().length, 2);
  const listed = await G.listNumbers((await import("../lib/supabase/server.js")).createServerSupabase(), ID);
  assert.deepEqual(listed.map((r) => String(r.month).slice(0, 7)), ["2026-10", "2026-09"], "newest first");
});

test("the audit log keeps the business and the month, never the figures", async () => {
  await put({ ...body, note: "a private remark" });
  const log = JSON.stringify(fake.tables.admin_audit_log);
  assert.ok(log.includes("sync.numbers.save") && log.includes("2026-10"));
  for (const secret of ["6140", "6,140", "342", "128", "private remark"]) assert.ok(!log.includes(secret), secret);
  await del("2026-10");
  assert.ok(JSON.stringify(fake.tables.admin_audit_log).includes("sync.numbers.delete"));
});

test("a bad request changes nothing and writes no log entry", async () => {
  for (const bad of [{ ...body, month: "2030-01" }, { ...body, calls: "-5" }, { month: "2026-10" }, { ...body, rating: "9" }]) assert.equal((await put(bad)).status, 400);
  assert.equal(rows().length, 0);
  assert.equal(fake.tables.admin_audit_log.length, 0);
  assert.equal((await put(body, "not-a-uuid")).status, 400);
  assert.equal((await put(body, OTHER)).status, 404, "a business that does not exist");
});

test("if the audit log cannot be written, nothing is saved or removed", async () => {
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await put()).status, 500);
  fake.failWritesTo = null;
  assert.equal(rows().length, 0);
  await put();
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await del("2026-10")).status, 500);
  fake.failWritesTo = null;
  assert.equal(rows().length, 1);
});

test("removing a month removes only that month; one that was never typed is 404; a bad month is 400", async () => {
  await put(); await put({ ...body, month: "2026-09" });
  assert.equal((await del("2026-10")).status, 200);
  assert.deepEqual(rows().map((r) => String(r.month).slice(0, 7)), ["2026-09"]);
  assert.equal((await del("2026-10")).status, 404);
  assert.equal((await del("nonsense")).status, 400);
  assert.equal(rows().length, 1);
});

test("signed out and ordinary users are refused", async () => {
  for (const [who, role, status] of [[null, null, 401], ["user_c", "user", 403]]) {
    as(who, role);
    assert.equal((await put()).status, status);
    assert.equal((await del("2026-10")).status, status);
  }
  assert.equal(rows().length, 0);
});

test("an operator can enter numbers only for a business assigned to them, and an unassigned one looks like it does not exist", async () => {
  as("user_op", "operator");
  assert.equal((await put()).status, 404);
  assert.equal(rows().length, 0);
  fake.tables.sync_operator_assignments.push({ operator_user_id: "user_op", merchant_id: ID });
  assert.equal((await put()).status, 200);
  assert.equal(rows().length, 1);
  assert.equal((await del("2026-10")).status, 200);
  seed(OTHER);
  assert.equal((await put(body, OTHER)).status, 404, "another business is still closed to them");
  assert.equal((await del("2026-10", OTHER)).status, 404);
});

test("a business on the Free plan cannot have numbers entered, but an unreadable stage never blocks", async () => {
  fake.reset(); as("user_admin", "admin");
  seed(ID, { stage: "free", trial_started_on: "2026-01-01", trial_ends_on: "2026-04-01" });
  const r = await put();
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Free plan/);
  assert.equal(rows().length, 0);
  fake.reset(); as("user_admin", "admin");
  seed(ID, { stage: "active", trial_started_on: "2026-01-01", trial_ends_on: "2026-04-01" });
  assert.equal((await put()).status, 200);
  fake.reset(); as("user_admin", "admin");
  seed();
  assert.equal((await put()).status, 200, "no stage row: not blocked");
});

// ---------- the screen ----------

test("the Google tab is the second tab for an admin and an operator, and the page shows it with the form held for Free", async () => {
  const T = await import("../lib/sync/businessTabs.js");
  assert.equal(T.tabsFor(true)[1].id, "google");
  assert.equal(T.tabsFor(false)[1].id, "google");
  assert.equal(T.resolveTab("google", false), "google");
  const page = read("app/admin/sync/[id]/page.js");
  assert.match(page, /tab === "google" \? <GoogleTab merchant=\{shown\} stage=\{stage\} \/>/);
  assert.match(page, /stage\.known && stage\.stage === "free"/);
  assert.match(page, /Has migration 0030 been run\?/);
});

test("the form removes a month only after a second press, and says what it did", () => {
  const client = read("app/admin/sync/[id]/GoogleNumbers.js");
  assert.match(client, /Really remove/);
  assert.ok(!/window\.(confirm|alert|prompt)/.test(client), "no browser dialogs");
  assert.match(client, /disabled=\{off\}/);
  assert.ok(!/dangerouslySetInnerHTML/.test(client));
});

test("the migration adds one private table, ties it to its business, and is safe to replay", () => {
  const sql = read("supabase/migrations/0030_sync_google_numbers.sql").replace(/--.*$/gm, "");
  assert.match(sql, /create table if not exists public\.sync_google_numbers/i);
  assert.match(sql, /references public\.sync_merchants\(id\) on delete cascade/i);
  assert.match(sql, /primary key \(merchant_id, month\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.sync_google_numbers from anon, authenticated/i);
  assert.ok(!/drop\s|delete\s+from|truncate|add column/i.test(sql));
});

test("deleting a business says its typed-in numbers go too, and the runbook explains the tab", () => {
  assert.match(read("app/admin/sync/[id]/DeletePanel.js"), /typed-in Google numbers/);
  const book = read("docs/sync/runbook.md");
  assert.match(book, /0030_sync_google_numbers\.sql/);
  assert.match(book, /The Google tab and the monthly numbers/);
});
