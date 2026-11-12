// Patch 13: the team's task list. The rules are pure and checked first, then the database calls through the stand-in database.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakePostgrest } from "./support/fake-postgrest.js";

const T = await import("../lib/sync/tasks.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");

const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";

// ---------- the rules ----------

test("a new task needs a business and a title, and starts open", () => {
  assert.equal(T.validateNewTask({ title: "Change Sunday hours" }).error, "Choose a business.");
  assert.equal(T.validateNewTask({ merchantId: "nope", title: "x" }).error, "Choose a business.");
  assert.equal(T.validateNewTask({ merchantId: M1 }).error, "Give the task a title.");
  assert.equal(T.validateNewTask({ merchantId: M1, title: "   " }).error, "Give the task a title.");
  assert.equal(T.validateNewTask(null).error, "Choose a business.");
  const { values } = T.validateNewTask({ merchantId: M1, title: "  Change Sunday hours  " });
  assert.deepEqual(values, { title: "Change Sunday hours", details: "", task_type: "other", assignee_user_id: null, due_date: null, urgent: false, merchant_id: M1, source: "other", source_note_id: null, status: "open" });
});

test("limits: the title is 120 characters and the details 1,000, and a type, source and status must come from the lists", () => {
  assert.equal(T.validateNewTask({ merchantId: M1, title: "x".repeat(120) }).error, undefined);
  assert.match(T.validateNewTask({ merchantId: M1, title: "x".repeat(121) }).error, /at most 120/);
  assert.equal(T.validateNewTask({ merchantId: M1, title: "t", details: "y".repeat(1000) }).error, undefined);
  assert.match(T.validateNewTask({ merchantId: M1, title: "t", details: "y".repeat(1001) }).error, /at most 1000/);
  assert.match(T.validateNewTask({ merchantId: M1, title: "t", type: "dance" }).error, /type/);
  assert.match(T.validateNewTask({ merchantId: M1, title: "t", source: "email" }).error, /where it came from/);
  for (const type of T.TASK_TYPES) assert.equal(T.validateNewTask({ merchantId: M1, title: "t", type }).values.task_type, type);
  assert.equal(T.validateNewTask({ merchantId: M1, title: "t", source: "note", sourceNoteId: "33333333-3333-4333-8333-333333333333" }).values.source_note_id, "33333333-3333-4333-8333-333333333333");
  assert.match(T.validateNewTask({ merchantId: M1, title: "t", sourceNoteId: "x" }).error, /private note/);
});

test("due dates are real days, and the assignee must look like an account", () => {
  const ok = (dueDate) => T.validateNewTask({ merchantId: M1, title: "t", dueDate });
  assert.equal(ok("2026-12-01").values.due_date, "2026-12-01");
  assert.equal(ok("").values.due_date, null);
  assert.equal(ok(null).values.due_date, null);
  for (const bad of ["2026-13-01", "2026-02-30", "01/12/2026", "tomorrow", "2026-1-1", 5]) assert.match(ok(bad).error, /due date/, String(bad));
  assert.equal(ok("2028-02-29").error, undefined, "a real leap day");
  assert.match(ok("2027-02-29").error, /due date/);
  const who = (assignee) => T.validateNewTask({ merchantId: M1, title: "t", assignee });
  assert.equal(who("user_abc123").values.assignee_user_id, "user_abc123");
  assert.equal(who(null).values.assignee_user_id, null);
  for (const bad of ["a b", "x".repeat(101), "../etc", 7, "<script>"]) assert.match(who(bad).error, /valid person/, String(bad));
});

test("an edit changes only what it names, and never the business or where it came from", () => {
  assert.equal(T.validateTaskPatch({}).error, "Nothing to change.");
  assert.deepEqual(T.validateTaskPatch({ status: "waiting" }).values, { status: "waiting" });
  assert.deepEqual(T.validateTaskPatch({ urgent: true, dueDate: "2026-12-05" }).values, { urgent: true, due_date: "2026-12-05" });
  assert.match(T.validateTaskPatch({ status: "finished" }).error, /status/);
  assert.match(T.validateTaskPatch({ urgent: "yes" }).error, /yes or no/);
  const sneaky = T.validateTaskPatch({ title: "ok", merchantId: M2, source: "note", created_by: "user_x", id: "x" });
  assert.deepEqual(sneaky.values, { title: "ok" }, "nothing but the editable fields gets through");
  assert.equal(T.validateTaskPatch({ title: "" }).error, "Give the task a title.");
});

test("moving a task to Done stamps when, and moving it out clears that", () => {
  const now = Date.UTC(2026, 11, 1, 6, 0, 0);
  const done = T.withStatusStamps({ status: "done" }, { status: "open" }, now);
  assert.equal(done.done_at, "2026-12-01T06:00:00.000Z");
  assert.equal(done.updated_at, "2026-12-01T06:00:00.000Z");
  assert.equal(T.withStatusStamps({ status: "open" }, { status: "done" }, now).done_at, null);
  assert.equal("done_at" in T.withStatusStamps({ title: "new title" }, { status: "done" }, now), false, "an edit that is not a status change leaves it alone");
  assert.equal("done_at" in T.withStatusStamps({ status: "done" }, { status: "done" }, now), false, "done again is not a new done");
});

test("\"due today\" follows Nepal's midnight, which is 18:15 UTC", () => {
  assert.equal(T.nepalToday(Date.UTC(2026, 11, 1, 18, 14, 59)), "2026-12-01", "one second before Nepal's midnight");
  assert.equal(T.nepalToday(Date.UTC(2026, 11, 1, 18, 15, 0)), "2026-12-02", "at Nepal's midnight");
  assert.equal(T.nepalToday(Date.UTC(2026, 11, 31, 18, 15, 0)), "2027-01-01", "across a new year");
  const open = (due, status = "open") => ({ status, due_date: due });
  assert.equal(T.isDueNow(open("2026-12-01"), "2026-12-01"), true, "due today");
  assert.equal(T.isDueNow(open("2026-11-20"), "2026-12-01"), true, "overdue counts");
  assert.equal(T.isDueNow(open("2026-12-02"), "2026-12-01"), false, "tomorrow does not");
  assert.equal(T.isDueNow(open(null), "2026-12-01"), false, "no date is never due");
  assert.equal(T.isDueNow(open("2026-11-20", "done"), "2026-12-01"), false, "done is never due");
  assert.equal(T.isDueNow(open("2026-11-20", "waiting"), "2026-12-01"), true, "with the owner is still due");
  assert.equal(T.countDue([open("2026-12-01"), open("2026-12-09"), open("2026-11-01", "done"), open("2026-10-01")], "2026-12-01"), 2);
  assert.equal(T.countDue(undefined, "2026-12-01"), 0);
});

test("urgent open tasks come first, then by due date with no date last, then done ones below", () => {
  const t = (id, o) => ({ id, status: "open", urgent: false, due_date: null, created_at: "2026-11-01T00:00:00Z", done_at: null, ...o });
  const order = T.sortTasks([
    t("late", { due_date: "2026-12-09" }), t("none-old", { created_at: "2026-10-01T00:00:00Z" }), t("done-old", { status: "done", done_at: "2026-11-02T00:00:00Z" }),
    t("urgent", { urgent: true, due_date: "2026-12-20" }), t("soon", { due_date: "2026-12-02" }), t("done-new", { status: "done", done_at: "2026-11-09T00:00:00Z" }), t("none-new", {})
  ]).map((task) => task.id);
  assert.deepEqual(order, ["urgent", "soon", "late", "none-new", "none-old", "done-new", "done-old"]);
});

// ---------- the database ----------

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
beforeEach(() => fake.reset());
const db = () => createServerSupabase();
const mk = (merchantId, title, extra = {}) => T.createTask(db(), { ...T.validateNewTask({ merchantId, title, ...extra }).values }, "user_admin");

test("a task is saved with who made it, can be read back, edited, and removed", async () => {
  const task = await mk(M1, "Change Sunday hours", { type: "hours", dueDate: "2026-12-01" });
  assert.equal(task.created_by, "user_admin");
  assert.equal(task.status, "open");
  assert.equal((await T.getTask(db(), task.id)).title, "Change Sunday hours");
  assert.equal(await T.getTask(db(), ""), null);
  assert.equal(await T.getTask(db(), undefined), null);
  const edited = await T.updateTask(db(), task.id, T.withStatusStamps({ status: "done" }, task, Date.UTC(2026, 11, 1)));
  assert.equal(edited.status, "done");
  assert.ok(edited.done_at);
  await T.deleteTask(db(), task.id);
  assert.equal(await T.getTask(db(), task.id), null);
});

test("a list can be limited to some businesses, and an empty limit is none, never all", async () => {
  await mk(M1, "One"); await mk(M2, "Two"); await mk(M2, "Three");
  assert.equal((await T.listTasks(db())).length, 3);
  assert.deepEqual((await T.listTasks(db(), { merchantIds: [M2] })).map((task) => task.title).sort(), ["Three", "Two"]);
  assert.deepEqual(await T.listTasks(db(), { merchantIds: [] }), [], "an operator with no businesses sees nothing");
  assert.equal(await T.dueTaskCount(db(), "2026-12-01", { merchantIds: [] }), 0);
});

test("the due count only counts open or waiting tasks that are due, and can be limited to some businesses", async () => {
  await mk(M1, "due today", { dueDate: "2026-12-01" }); await mk(M1, "overdue", { dueDate: "2026-11-01" }); await mk(M1, "later", { dueDate: "2027-01-01" });
  await mk(M1, "no date"); await mk(M2, "other business, due", { dueDate: "2026-12-01" });
  const done = await mk(M1, "done and old", { dueDate: "2026-10-01" });
  await T.updateTask(db(), done.id, { status: "done" });
  assert.equal(await T.dueTaskCount(db(), "2026-12-01"), 3 + 0, "today, overdue, and the other business's");
  assert.equal(await T.dueTaskCount(db(), "2026-12-01", { merchantIds: [M1] }), 2);
});

test("a database problem is an error, never an empty list that looks like no tasks", async () => {
  await mk(M1, "One");
  fake.failReadsFrom = "sync_tasks";
  await assert.rejects(() => T.listTasks(db()), /could not be read/);
  await assert.rejects(() => T.dueTaskCount(db(), "2026-12-01"), /could not be counted/);
});
