// Patch 14a: stages and the 90-day trial. The rules are pure and checked first, then the route, then the screens' wiring.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const S = await import("../lib/sync/stage.js");
const { readStage, writeStage } = await import("../lib/sync/stageStore.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");
const { PUT: stageRoute } = await import("../app/api/admin/sync/merchants/[id]/stage/route.js");

// Nepal is UTC+5:45 all year, so Nepal's midnight is 18:15 UTC the day before.
const at = (y, m, d, h = 6, min = 0) => Date.UTC(y, m - 1, d, h, min);
const NOW = at(2026, 11, 13); // a Nepal day: 2026-11-13
const row = (o = {}) => ({ id: "11111111-1111-4111-8111-111111111111", stage: "wip", trial_started_on: "2026-10-24", trial_ends_on: "2027-01-22", stage_note: null, stage_changed_at: null, ...o });

// ---------- dates ----------

test("dates add and count across months, years and a leap day", () => {
  assert.equal(S.addDays("2026-10-24", 90), "2027-01-22");
  assert.equal(S.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(S.addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(S.addDays("2027-02-28", 1), "2027-03-01");
  assert.equal(S.diffDays("2026-10-24", "2026-11-13"), 20);
  assert.equal(S.diffDays("2026-11-13", "2026-10-24"), -20);
  assert.equal(S.shortDate("2027-01-22"), "22 Jan");
  assert.equal(S.shortDate("2026-12-05"), "5 Dec");
  assert.equal(S.longDate("2027-01-22"), "22 Jan 2027");
  for (const ok of ["2026-11-13", "2028-02-29"]) assert.equal(S.isIsoDate(ok), true, ok);
  for (const bad of ["2026-13-01", "2027-02-29", "2026-1-1", "13/11/2026", "", null, undefined, 20261113, "2026-11-13T00:00:00Z"]) assert.equal(S.isIsoDate(bad), false, String(bad));
});

// ---------- what a stage is today ----------

test("a trial 20 days in: day 20 of 90, 70 days left, the next check-in is day 30, ten days away", () => {
  const info = S.stageInfo(row(), NOW);
  assert.deepEqual([info.known, info.stage, info.stored, info.expired, info.day, info.total, info.daysLeft], [true, "wip", "wip", false, 20, 90, 70]);
  assert.deepEqual(info.checkins, [{ day: 30, on: "2026-11-23" }, { day: 60, on: "2026-12-23" }, { day: 80, on: "2027-01-12" }]);
  assert.deepEqual(info.nextCheckin, { day: 30, on: "2026-11-23", inDays: 10 });
  assert.equal(info.decideSoon, false);
});

test("day 0 is the day the trial starts, and a check-in falls due on its own day", () => {
  assert.equal(S.stageInfo(row({ trial_started_on: "2026-11-13", trial_ends_on: "2027-02-11" }), NOW).day, 0);
  const onDay30 = S.stageInfo(row(), at(2026, 11, 23));
  assert.equal(onDay30.day, 30);
  assert.deepEqual(onDay30.nextCheckin, { day: 30, on: "2026-11-23", inDays: 0 }, "due today, not skipped");
  assert.equal(S.stageInfo(row(), at(2026, 11, 24)).nextCheckin.day, 60, "the day after, the next one is day 60");
  assert.equal(S.stageInfo(row(), at(2027, 1, 13)).nextCheckin, null, "after day 80 there are none left");
});

test("\"decide soon\" starts with ten days left", () => {
  assert.equal(S.stageInfo(row(), at(2027, 1, 12)).decideSoon, true, "10 days left");
  assert.equal(S.stageInfo(row(), at(2027, 1, 11)).decideSoon, false, "11 days left");
  assert.equal(S.stageInfo(row(), at(2027, 1, 22)).decideSoon, true, "on the decision day");
});

test("the decision day is still WIP, and the next Nepal day it is Free, turning at Nepal's midnight (18:15 UTC)", () => {
  assert.equal(S.stageInfo(row(), at(2027, 1, 22, 6, 0)).stage, "wip", "day 90, midday");
  assert.equal(S.stageInfo(row(), at(2027, 1, 22, 18, 14)).stage, "wip", "one minute before Nepal's midnight");
  const free = S.stageInfo(row(), at(2027, 1, 22, 18, 15));
  assert.deepEqual([free.stage, free.stored, free.expired], ["free", "wip", true], "at Nepal's midnight");
  assert.equal(S.stageInfo(row(), at(2027, 6, 1)).stage, "free", "long after");
  assert.equal(S.stageInfo(row(), at(2027, 6, 1)).day, 90, "the day count stops at the end");
  assert.equal(S.stageInfo(row(), at(2027, 6, 1)).daysLeft, 0);
});

test("Active and Free stay as saved, whatever the dates say", () => {
  for (const stage of ["active", "free"]) {
    const info = S.stageInfo(row({ stage }), at(2028, 1, 1));
    assert.deepEqual([info.stage, info.expired], [stage, false], stage);
  }
});

test("a business with no stage, a bad stage, or bad dates is unknown, never guessed", () => {
  for (const bad of [null, undefined, {}, row({ stage: "paid" }), row({ stage: "" }), row({ trial_started_on: null }), row({ trial_ends_on: "soon" }), row({ trial_started_on: "2027-02-01", trial_ends_on: "2027-01-01" })]) {
    assert.equal(S.stageInfo(bad, NOW).known, false, JSON.stringify(bad));
  }
});

test("a shortened trial has only the check-ins that come before its end", () => {
  const info = S.stageInfo(row({ trial_ends_on: "2026-12-08" }), NOW); // 45 days
  assert.equal(info.total, 45);
  assert.deepEqual(info.checkins.map((c) => c.day), [30]);
});

test("the one-line stage reads plainly", () => {
  assert.equal(S.stageLine(S.stageInfo(row(), NOW)), "WIP · Day 20 of 90 · ends 22 Jan");
  assert.equal(S.stageLine(S.stageInfo(row({ stage: "active" }), NOW)), "Active");
  assert.equal(S.stageLine(S.stageInfo(row({ stage: "free" }), NOW)), "Free");
  assert.equal(S.stageLine(S.stageInfo(row(), at(2027, 3, 1))), "Free · trial ended 22 Jan");
  assert.equal(S.stageLine({ known: false }), "No stage yet");
});

// ---------- the moves ----------

const move = (r, input, now = NOW) => S.planMove(r, input, now);
const ok = (r, input, now) => { const m = move(r, input, now); assert.equal(m.ok, true, JSON.stringify([input, m])); return m; };
const refused = (r, input, match, now) => { const m = move(r, input, now); assert.equal(m.ok, false, JSON.stringify(input)); if (match) assert.match(m.error, match); return m; };
const EXPIRED = row({ trial_ends_on: "2026-11-01" }); // stored wip, past its end: Free for now

test("make Active: from WIP, from Free and from an expired trial, never from Active", () => {
  const m = ok(row(), { action: "make_active", note: "  Replies to reviews  " });
  assert.deepEqual([m.from, m.to, m.values.stage, m.values.stage_note], ["wip", "active", "active", "Replies to reviews"]);
  assert.equal(m.values.stage_changed_at, new Date(NOW).toISOString());
  assert.equal(ok(row({ stage: "free" }), { action: "make_active" }).values.stage_note, null, "no note is no note");
  assert.equal(ok(EXPIRED, { action: "make_active" }).from, "free", "an expired trial counts as Free");
  refused(row({ stage: "active" }), { action: "make_active" }, /already Active/);
});

test("move to Free needs the manager box ticked, and only a real true counts", () => {
  for (const bad of [undefined, false, "true", 1, "on", null]) refused(row(), { action: "move_to_free", managerRemoved: bad }, /removed as a manager/);
  const m = ok(row(), { action: "move_to_free", managerRemoved: true, note: "The price, for now" });
  assert.deepEqual([m.from, m.to, m.values.stage, m.values.stage_note], ["wip", "free", "free", "The price, for now"]);
  assert.equal(ok(row({ stage: "active" }), { action: "move_to_free", managerRemoved: true }).from, "active", "a paying business can go Free");
  refused(row({ stage: "free" }), { action: "move_to_free", managerRemoved: true }, /already Free/);
  refused(EXPIRED, { action: "move_to_free", managerRemoved: true }, /already Free/);
  assert.equal("trial_ends_on" in m.values, false, "the trial's dates are left as they were");
});

test("start a trial again: only for a Free business, 90 days from today unless told, never from Active or a running trial", () => {
  const m = ok(row({ stage: "free" }), { action: "start_trial" });
  assert.deepEqual([m.to, m.values.stage, m.values.trial_started_on, m.values.trial_ends_on], ["wip", "wip", "2026-11-13", "2027-02-11"]);
  assert.equal(ok(row({ stage: "free" }), { action: "start_trial", days: "45" }).values.trial_ends_on, "2026-12-28");
  assert.equal(ok(EXPIRED, { action: "start_trial" }).from, "free", "an expired trial can be started again");
  for (const bad of [0, 366, 1.5, "abc", -5, NaN]) refused(row({ stage: "free" }), { action: "start_trial", days: bad }, /1 to 365 days/);
  refused(row({ stage: "active" }), { action: "start_trial" }, /only be started again for a Free/);
  refused(row(), { action: "start_trial" }, /only be started again for a Free/);
});

test("change the end date: only on a trial, a real future day after the start, within a year, with a reason", () => {
  const m = ok(row(), { action: "change_end_date", endsOn: "2027-02-21", note: "Low season, too few reviews yet" });
  assert.deepEqual(m.values.trial_ends_on, "2027-02-21");
  assert.equal(m.values.stage_note, "Low season, too few reviews yet");
  assert.equal("stage" in m.values, false, "the stage itself does not change");
  refused(row(), { action: "change_end_date", endsOn: "2027-02-21" }, /why the end date/);
  refused(row(), { action: "change_end_date", endsOn: "2027-02-21", note: "   " }, /why the end date/);
  refused(row(), { action: "change_end_date", endsOn: "soon", note: "x" }, /as a day/);
  refused(row(), { action: "change_end_date", endsOn: "2026-11-12", note: "x" }, /in the past/);
  refused(row({ trial_started_on: "2026-11-13", trial_ends_on: "2027-02-11" }), { action: "change_end_date", endsOn: "2026-11-13", note: "x" }, /after the day the trial started/);
  refused(row(), { action: "change_end_date", endsOn: "2027-10-25", note: "x" }, /longer than 365 days/);
  ok(row(), { action: "change_end_date", endsOn: "2027-10-24", note: "x" }); // exactly a year
  refused(row({ stage: "active" }), { action: "change_end_date", endsOn: "2027-02-21", note: "x" }, /only be changed on a trial/);
  refused(row({ stage: "free" }), { action: "change_end_date", endsOn: "2027-02-21", note: "x" }, /only be changed on a trial/);
  const revived = ok(EXPIRED, { action: "change_end_date", endsOn: "2026-12-31", note: "Owner asked for more time" });
  assert.equal(S.stageInfo({ ...EXPIRED, ...revived.values }, NOW).stage, "wip", "a new future end date brings an expired trial back");
});

test("a note over 500 characters, no action, an unknown action and bad input are refused", () => {
  refused(row(), { action: "make_active", note: "x".repeat(501) }, /at most 500/);
  ok(row(), { action: "make_active", note: "x".repeat(500) });
  for (const bad of [{}, { action: "" }, { action: "delete" }, { action: "MAKE_ACTIVE" }, null, undefined, "make_active", 7]) refused(row(), bad, /Choose what to do/);
  refused(null, { action: "make_active" }, /migration 0026/);
  refused(row({ stage: "paid" }), { action: "make_active" }, /migration 0026/);
});

test("a move only ever writes the stage columns, and nothing else the request carries", () => {
  const allowed = new Set(["stage", "trial_started_on", "trial_ends_on", "stage_note", "stage_changed_at"]);
  const sneaky = { note: "n", managerRemoved: true, endsOn: "2027-02-21", days: 30, status: "cancelled", owner_user_id: "user_x", slug: "evil", id: "9", stage_changed_by: "me" };
  for (const [r, action] of [[row(), "make_active"], [row(), "move_to_free"], [row({ stage: "free" }), "start_trial"], [row(), "change_end_date"]]) {
    const m = ok(r, { ...sneaky, action });
    for (const key of Object.keys(m.values)) assert.ok(allowed.has(key), `${action} writes ${key}`);
  }
});

// ---------- the route ----------

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
const realNow = Date.now;
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { Date.now = realNow; for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });

const ID = "11111111-1111-4111-8111-111111111111";
const as = (userId, role) => { globalThis.__KC_TEST__ = { userId, roles: userId ? { [userId]: role } : {}, cookies: {}, revalidatedPaths: [] }; };
const seed = (o = {}) => { fake.tables.sync_merchants.push({ id: ID, slug: "ram-cafe", topic_slug: "ram-cafe-x", business_name: "Ram Cafe", area: "X", status: "active", owner_user_id: null, about: "", ...row(), ...o }); };
beforeEach(() => { fake.reset(); Date.now = () => NOW; as("user_admin", "admin"); });
const put = async (body, id = ID) => { const response = await stageRoute(new Request("https://www.kastochhanepal.com/x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: { id } }); return { status: response.status, body: await response.json() }; };
const stored = () => fake.tables.sync_merchants.find((m) => m.id === ID);
const audit = () => fake.tables.admin_audit_log;

test("only an admin can move a business: signed out, an ordinary user and an operator are refused, and nothing changes", async () => {
  seed();
  for (const [who, role, status] of [[null, null, 401], ["user_cust", "user", 403], ["user_op", "operator", 403]]) {
    as(who, role);
    assert.equal((await put({ action: "make_active" })).status, status, String(who));
  }
  assert.equal(stored().stage, "wip");
  assert.equal(audit().length, 0);
});

test("a bad id is 400, a missing business 404, and a database problem says to run the migration", async () => {
  seed();
  assert.equal((await put({ action: "make_active" }, "not-an-id")).status, 400);
  assert.equal((await put({ action: "make_active" }, "99999999-9999-4999-8999-999999999999")).status, 404);
  fake.failReadsFrom = "sync_merchants";
  const result = await put({ action: "make_active" });
  assert.equal(result.status, 500);
  assert.match(result.body.error, /migration 0026/);
});

test("Make Active saves the stage, who and when, and records the move without the note's words", async () => {
  seed();
  const result = await put({ action: "make_active", note: "Loves the replies to reviews" });
  assert.equal(result.status, 200);
  assert.equal(result.body.stage.stage, "active");
  assert.deepEqual([stored().stage, stored().stage_note, stored().stage_changed_by, stored().stage_changed_at], ["active", "Loves the replies to reviews", "user_admin", new Date(NOW).toISOString()]);
  assert.equal(audit().length, 1);
  assert.deepEqual([audit()[0].action, audit()[0].actor_id, audit()[0].target_id, audit()[0].status], ["sync.stage.make_active", "user_admin", ID, "applied"]);
  assert.deepEqual(audit()[0].before, { stage: "wip", trial_started_on: "2026-10-24", trial_ends_on: "2027-01-22" });
  assert.equal(audit()[0].after.stage, "active");
  assert.doesNotMatch(JSON.stringify(audit()[0]), /Loves the replies/, "the note stays out of the log");
});

test("Move to Free is refused until the manager box is ticked, then it works, and the business keeps its tag", async () => {
  seed();
  const refusedNow = await put({ action: "move_to_free", note: "The price" });
  assert.equal(refusedNow.status, 400);
  assert.match(refusedNow.body.error, /removed as a manager/);
  assert.equal(stored().stage, "wip");
  assert.equal(audit().length, 0, "a refused move leaves no entry");
  assert.equal((await put({ action: "move_to_free", managerRemoved: true, note: "The price" })).status, 200);
  assert.deepEqual([stored().stage, stored().status, stored().trial_ends_on], ["free", "active", "2027-01-22"], "its page tag (status) and dates are untouched");
});

test("Start a trial again, and Change the end date, save their dates and are recorded", async () => {
  seed({ stage: "free" });
  assert.equal((await put({ action: "start_trial", days: 60, note: "Owner is ready to try again" })).status, 200);
  assert.deepEqual([stored().stage, stored().trial_started_on, stored().trial_ends_on], ["wip", "2026-11-13", "2027-01-12"]);
  assert.equal((await put({ action: "change_end_date", endsOn: "2027-02-12", note: "Low season" })).status, 200);
  assert.equal(stored().trial_ends_on, "2027-02-12");
  assert.deepEqual(audit().map((a) => a.action), ["sync.stage.start_trial", "sync.stage.change_end_date"]);
});

test("a move that is not allowed changes nothing: Active cannot go back to a trial", async () => {
  seed({ stage: "active" });
  const result = await put({ action: "start_trial" });
  assert.equal(result.status, 400);
  assert.equal(stored().stage, "active");
  assert.equal(audit().length, 0);
});

test("if the audit log cannot be written, nothing is changed", async () => {
  seed();
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await put({ action: "make_active" })).status, 500);
  assert.equal(stored().stage, "wip");
});

test("if saving fails, the move is recorded as not applied and the business is unchanged", async () => {
  seed();
  fake.failWritesTo = "sync_merchants";
  assert.equal((await put({ action: "make_active" })).status, 500);
  assert.equal(stored().stage, "wip");
  assert.equal(audit()[0]?.status, "failed");
});

test("two people pressing at once: the second is told, and does not overwrite the first", async () => {
  seed();
  const db = createServerSupabase();
  assert.equal(await writeStage(db, ID, "active", { stage: "free" }), null, "the business is not Active, so nothing is written");
  assert.equal(stored().stage, "wip");
  const done = await writeStage(db, ID, "wip", { stage: "active" });
  assert.equal(done.stage, "active");
  assert.equal(await writeStage(db, ID, "wip", { stage: "free" }), null, "now it is Active, so a move worked out from WIP is turned away");
  assert.equal(stored().stage, "active");
  assert.equal((await readStage(db, ID)).stage, "active");
  assert.equal(await readStage(db, "99999999-9999-4999-8999-999999999999"), null);
});

// ---------- the screens ----------

const read = (file) => fs.readFileSync(file, "utf8");

test("the public pages never read the stage: the column list they use does not include it", () => {
  const merchants = read("lib/sync/merchants.js");
  const columns = merchants.slice(merchants.indexOf("const COLUMNS"), merchants.indexOf("async function readOne"));
  for (const column of ["stage", "trial_", "stage_note"]) assert.ok(!columns.includes(column), `a public page would read ${column}`);
  assert.match(read("lib/sync/stageStore.js"), /Kept apart from the columns the public pages read/);
});

test("the Businesses list shows each business's stage, no longer a tag-removed label, and says so if stages cannot be read", () => {
  const page = read("app/admin/sync/businesses/page.js");
  assert.match(page, /readStages\(createServerSupabase\(\), merchants\.map\(\(m\) => m\.id\)\)/);
  assert.match(page, /STAGE_LABELS\[stage\.stage\]/);
  assert.doesNotMatch(page, /Tag removed/);
  assert.match(page, /stages\.failed \? <div className="admin-banner" role="status">The stages could not be read\. Has the Sync migration 0026 been run\?/);
  assert.match(page, /Day \{stage\.day\} of \{stage\.total\}/);
});

test("the business page shows the stage panel to an admin to use and to an operator to read, and a failed read cannot break it", () => {
  const page = read("app/admin/sync/[id]/page.js");
  assert.match(page, /<StagePanel merchantId=\{merchant\.id\} info=\{stage\} isAdmin=\{isAdmin\} \/>/, "one panel, told whether the viewer is an admin");
  assert.match(page, /<OverviewTab merchant=\{shown\} stage=\{stage\} isAdmin=\{access\.isAdmin\} \/>/, "the viewer's own role is what is passed, never a constant true");
  assert.match(page, /catch \{\s*stage = \{ known: false \};/);
  assert.doesNotMatch(page, /isAdmin \/>/, "no panel is ever drawn with the buttons switched on unconditionally");
});

test("the stage panel sends moves to the stage route, holds Move to Free until the box is ticked, and shows the reason when refused", () => {
  const panel = read("app/admin/sync/[id]/StagePanel.js");
  assert.match(panel, /\/api\/admin\/sync\/merchants\/\$\{merchantId\}\/stage/);
  assert.match(panel, /method: "PUT"/);
  assert.match(panel, /disabled=\{busy \|\| !ticked\} onClick=\{\(\) => send\(\{ action: "move_to_free", managerRemoved: ticked, note \}\)\}/);
  assert.match(panel, /\{isAdmin \? \(/, "the buttons are only for an admin");
  assert.match(panel, /Working…/);
  assert.match(panel, /setError\(failure\.message\)/);
  assert.match(panel, /Decide by \{longDate\(info\.endsOn\)\}/);
  for (const action of ["make_active", "move_to_free", "start_trial", "change_end_date"]) assert.match(panel, new RegExp(`action: "${action}"`), action);
});
