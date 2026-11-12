// Patch 13: operators, assignments and tasks, through the real routes. The heart of it is who may do what.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { GET: listRoute, POST: createRoute } = await import("../app/api/admin/sync/tasks/route.js");
const { PATCH: patchRoute, DELETE: deleteRoute } = await import("../app/api/admin/sync/tasks/[id]/route.js");
const { POST: addOperator, DELETE: removeOperator } = await import("../app/api/admin/sync/team/operators/route.js");
const { PUT: assignRoute, DELETE: unassignRoute } = await import("../app/api/admin/sync/assignments/route.js");
const { PUT: merchantPut } = await import("../app/api/admin/sync/merchants/[id]/route.js");

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ROLES = { user_admin: "admin", user_admin2: "admin", user_op1: "operator", user_op2: "operator", user_cust: "user", user_owner: "user", user_newbie: "user" };
const ACCOUNTS = Object.fromEntries(Object.keys(ROLES).map((id) => [id, { fullName: id, emails: [{ address: `${id}@example.com`, verified: true }] }]));
const as = (userId) => { globalThis.__KC_TEST__ = { userId, roles: { ...ROLES }, clerkUsers: ACCOUNTS, cookies: {}, revalidatedPaths: [] }; };
const merchant = (id, slug, extra = {}) => ({ id, slug, topic_slug: `${slug}-x`, thread_title: `${slug}, X`, business_name: slug, area: "X", business_kind: "cafe", kind_label: null, category: "Food", status: "active", owner_user_id: null, about: "", google_place_id: null, google_review_url: null, google_maps_url: null, created_at: "2026-10-01T00:00:00Z", ...extra });
beforeEach(() => {
  fake.reset();
  fake.tables.sync_merchants.push(merchant(A, "ram-cafe", { owner_user_id: "user_owner" }), merchant(B, "momo-hub"));
  fake.tables.sync_operator_assignments.push({ operator_user_id: "user_op1", merchant_id: A, assigned_by: "user_admin", created_at: "2026-11-01T00:00:00Z" });
  as(null);
});

const json = (url, method, body) => new Request(`https://www.kastochhanepal.com${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id) => ({ params: { id } });
const seedTask = (o = {}) => { const task = { id: `aaaaaaaa-0000-4000-8000-${String(fake.tables.sync_tasks.length + 1).padStart(12, "0")}`, merchant_id: A, title: "A task", details: "", task_type: "other", source: "other", source_note_id: null, assignee_user_id: null, due_date: null, status: "open", urgent: false, created_by: "user_admin", created_at: "2026-11-02T00:00:00Z", updated_at: "2026-11-02T00:00:00Z", done_at: null, ...o }; fake.tables.sync_tasks.push(task); return task; };
const list = async () => { const response = await listRoute(); return { status: response.status, body: await response.json() }; };
const create = async (body) => { const response = await createRoute(json("/api/admin/sync/tasks", "POST", body)); return { status: response.status, body: await response.json() }; };
const patch = async (id, body) => { const response = await patchRoute(json(`/api/admin/sync/tasks/${id}`, "PATCH", body), ctx(id)); return { status: response.status, body: await response.json() }; };
const audit = () => fake.tables.admin_audit_log;

// ---------- the tasks list ----------

test("an operator sees only the tasks of the businesses assigned to them; an admin sees all", async () => {
  seedTask({ title: "for A" }); seedTask({ title: "for B", merchant_id: B });
  as("user_op1");
  assert.deepEqual((await list()).body.tasks.map((t) => t.title), ["for A"]);
  as("user_op2");
  assert.deepEqual((await list()).body.tasks, [], "an operator with no businesses sees nothing");
  as("user_admin");
  assert.deepEqual((await list()).body.tasks.map((t) => t.title).sort(), ["for A", "for B"]);
  assert.match((await list()).body.today, /^\d{4}-\d{2}-\d{2}$/);
});

test("signed out is refused, and so is an ordinary user", async () => {
  seedTask();
  as(null); assert.equal((await list()).status, 401);
  as("user_cust"); assert.equal((await list()).status, 403);
  assert.equal((await create({ merchantId: A, title: "x" })).status, 403);
  assert.equal((await patch(fake.tables.sync_tasks[0].id, { status: "done" })).status, 403);
  assert.equal((await deleteRoute(json("/x", "DELETE"), ctx(fake.tables.sync_tasks[0].id))).status, 403);
  assert.equal(fake.tables.sync_tasks.length, 1);
});

test("if an operator's assignments cannot be read, they get an error, never everyone's tasks", async () => {
  seedTask({ title: "for B", merchant_id: B });
  as("user_op1");
  fake.failReadsFrom = "sync_operator_assignments";
  const result = await list();
  assert.equal(result.status, 500);
  assert.doesNotMatch(JSON.stringify(result.body), /for B/);
});

// ---------- making and changing tasks ----------

test("an operator can make a task for an assigned business, for themselves or nobody; never for another business, another person, or from a note", async () => {
  as("user_op1");
  const ok = await create({ merchantId: A, title: "Change Sunday hours", type: "hours", assignee: "user_op1", dueDate: "2026-12-01" });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.task.created_by, "user_op1");
  assert.equal((await create({ merchantId: A, title: "Nobody's" })).status, 201);
  assert.equal((await create({ merchantId: B, title: "Not mine" })).status, 404, "an unassigned business looks like a missing one");
  assert.equal((await create({ merchantId: "33333333-3333-4333-8333-333333333333", title: "Missing" })).status, 404);
  assert.equal((await create({ merchantId: A, title: "x", assignee: "user_admin" })).status, 400);
  assert.equal((await create({ merchantId: A, title: "x", source: "note" })).status, 403);
  assert.equal(fake.tables.sync_tasks.length, 2);
});

test("an admin can give a task to an operator assigned to that business, or another admin, and to nobody else", async () => {
  as("user_admin");
  assert.equal((await create({ merchantId: A, title: "to op1", assignee: "user_op1" })).status, 201);
  assert.equal((await create({ merchantId: B, title: "to op1 on B", assignee: "user_op1" })).status, 400, "op1 is not assigned to B");
  assert.equal((await create({ merchantId: A, title: "to admin2", assignee: "user_admin2" })).status, 201);
  assert.equal((await create({ merchantId: A, title: "to a customer", assignee: "user_cust" })).status, 400);
  assert.equal((await create({ merchantId: A, title: "from a note", source: "note", sourceNoteId: "44444444-4444-4444-8444-444444444444" })).status, 201);
});

test("validation answers 400 with the reason, and the body cannot slip in other fields", async () => {
  as("user_admin");
  assert.equal((await create({ merchantId: A, title: "" })).body.error, "Give the task a title.");
  assert.equal((await create({ merchantId: A, title: "x", dueDate: "2026-02-30" })).status, 400);
  const sneaky = await create({ merchantId: A, title: "ok", created_by: "user_someone", id: "99999999-9999-4999-8999-999999999999", status: "done" });
  assert.equal(sneaky.body.task.created_by, "user_admin");
  assert.equal(sneaky.body.task.status, "open");
  assert.notEqual(sneaky.body.task.id, "99999999-9999-4999-8999-999999999999");
});

test("an operator can change tasks of an assigned business; any other task is not found; Done is stamped and can be undone", async () => {
  const mine = seedTask({ title: "mine" }); const other = seedTask({ title: "other", merchant_id: B });
  as("user_op1");
  const done = await patch(mine.id, { status: "done" });
  assert.equal(done.status, 200);
  assert.equal(done.body.task.status, "done");
  assert.ok(done.body.task.done_at);
  assert.equal((await patch(mine.id, { status: "open" })).body.task.done_at, null);
  assert.equal((await patch(other.id, { status: "done" })).status, 404);
  assert.equal(fake.tables.sync_tasks.find((t) => t.id === other.id).status, "open", "nothing changed");
  assert.equal((await patch("not-an-id", { status: "done" })).status, 400);
  assert.equal((await patch("55555555-5555-4555-8555-555555555555", { status: "done" })).status, 404);
  assert.equal((await patch(mine.id, { assignee: "user_admin" })).status, 400, "an operator cannot hand a task to someone else");
  assert.equal((await patch(mine.id, { assignee: "user_op1" })).status, 200);
});

test("an edit cannot move a task to another business, or change who made it", async () => {
  const task = seedTask();
  as("user_admin");
  const result = await patch(task.id, { title: "renamed", merchantId: B, created_by: "user_x", source: "note" });
  assert.equal(result.status, 200);
  const stored = fake.tables.sync_tasks[0];
  assert.deepEqual([stored.title, stored.merchant_id, stored.created_by, stored.source], ["renamed", A, "user_admin", "other"]);
});

test("only an admin can delete a task", async () => {
  const task = seedTask();
  as("user_op1");
  assert.equal((await deleteRoute(json("/x", "DELETE"), ctx(task.id))).status, 403);
  assert.equal(fake.tables.sync_tasks.length, 1);
  as("user_admin");
  assert.equal((await deleteRoute(json("/x", "DELETE"), ctx("not-an-id"))).status, 400);
  assert.equal((await deleteRoute(json("/x", "DELETE"), ctx("66666666-6666-4666-8666-666666666666"))).status, 404);
  assert.equal((await deleteRoute(json("/x", "DELETE"), ctx(task.id))).status, 200);
  assert.equal(fake.tables.sync_tasks.length, 0);
});

// ---------- operators ----------

const addOp = async (userId) => { const response = await addOperator(json("/api/admin/sync/team/operators", "POST", { userId })); return { status: response.status, body: await response.json() }; };
const removeOp = async (userId) => { const response = await removeOperator(json("/api/admin/sync/team/operators", "DELETE", { userId })); return { status: response.status, body: await response.json() }; };

test("an admin can make an account an operator, and it is recorded; running it again changes nothing", async () => {
  as("user_admin");
  const first = await addOp("user_newbie");
  assert.equal(first.status, 200);
  assert.equal(globalThis.__KC_TEST__.roles.user_newbie, "operator");
  assert.deepEqual(globalThis.__KC_TEST__.metadataWrites, [{ userId: "user_newbie", publicMetadata: { role: "operator" } }], "only the role is sent, so nothing else the account carries is replaced");
  assert.deepEqual(fake.tables.sync_operators.map((r) => [r.operator_user_id, r.added_by]), [["user_newbie", "user_admin"]], "they are on the Team page's list");
  assert.equal(audit().length, 1);
  assert.deepEqual([audit()[0].action, audit()[0].actor_id, audit()[0].target_id, audit()[0].before.role, audit()[0].after.role], ["sync.operator.add", "user_admin", "user_newbie", "user", "operator"]);
  assert.equal(audit()[0].status, "applied");
  const again = await addOp("user_newbie");
  assert.equal(again.body.unchanged, true);
  assert.equal(audit().length, 1, "nothing new is recorded");
  assert.equal(fake.tables.sync_operators.length, 1, "and they are not listed twice");
});

test("an operator who is already one in Clerk but missing from the list is added to the list, with no new role change or audit entry", async () => {
  as("user_admin");
  assert.equal(fake.tables.sync_operators.length, 0);
  const result = await addOp("user_op2");
  assert.equal(result.body.unchanged, true);
  assert.deepEqual(fake.tables.sync_operators.map((r) => r.operator_user_id), ["user_op2"]);
  assert.equal(audit().length, 0);
  assert.equal(globalThis.__KC_TEST__.metadataWrites, undefined);
});

test("an admin cannot be made an operator, nor can a business's linked owner, nor a missing account", async () => {
  as("user_admin");
  assert.equal((await addOp("user_admin2")).status, 400);
  assert.equal(globalThis.__KC_TEST__.roles.user_admin2, "admin");
  const owner = await addOp("user_owner");
  assert.equal(owner.status, 400);
  assert.match(owner.body.error, /verified owner/);
  assert.equal(globalThis.__KC_TEST__.roles.user_owner, "user");
  assert.equal((await addOp("user_nobody_at_all")).status, 404);
  assert.equal((await addOperator(json("/x", "POST", { userId: "bad id!" }))).status, 400);
  assert.equal((await addOperator(json("/x", "POST", {}))).status, 400);
  assert.equal(audit().length, 0);
});

test("only an admin can add or remove an operator: an operator, an ordinary user and a signed-out visitor are refused", async () => {
  for (const [who, status] of [["user_op1", 403], ["user_cust", 403], [null, 401]]) {
    as(who);
    assert.equal((await addOp("user_newbie")).status, status, String(who));
    assert.equal((await removeOp("user_op1")).status, status, String(who));
  }
  assert.equal(globalThis.__KC_TEST__.roles.user_newbie, "user");
  assert.equal(globalThis.__KC_TEST__.roles.user_op1, "operator");
  assert.equal(fake.tables.sync_operator_assignments.length, 1);
  assert.equal(audit().length, 0);
});

test("removing an operator returns them to an ordinary user, removes their assignments, and leaves their tasks with nobody", async () => {
  seedTask({ title: "op1's", assignee_user_id: "user_op1" }); seedTask({ title: "someone else's", assignee_user_id: "user_admin" });
  fake.tables.sync_operators.push({ operator_user_id: "user_op1", added_by: "user_admin", created_at: "2026-11-01T00:00:00Z" });
  as("user_admin");
  const result = await removeOp("user_op1");
  assert.equal(fake.tables.sync_operators.length, 0, "they leave the Team page's list");
  assert.equal(result.status, 200);
  assert.equal(globalThis.__KC_TEST__.roles.user_op1, "user");
  assert.equal(fake.tables.sync_operator_assignments.length, 0);
  assert.deepEqual(fake.tables.sync_tasks.map((t) => [t.title, t.assignee_user_id]), [["op1's", null], ["someone else's", "user_admin"]]);
  assert.equal(fake.tables.sync_tasks.length, 2, "no task is deleted");
  assert.equal(audit()[0].action, "sync.operator.remove");
  globalThis.__KC_TEST__.userId = "user_op1"; // the same session, keeping the role change just made
  assert.equal((await list()).status, 403, "their access is gone at once");
  globalThis.__KC_TEST__.userId = "user_admin";
  assert.equal((await removeOp("user_admin2")).status, 400, "an admin is not an operator to remove");
});

test("if the audit log cannot be written, no role changes", async () => {
  as("user_admin");
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await addOp("user_newbie")).status, 500);
  assert.equal(globalThis.__KC_TEST__.roles.user_newbie, "user");
});

// ---------- assignments ----------

const assign = async (body, method = "PUT") => { const response = await (method === "PUT" ? assignRoute : unassignRoute)(json("/api/admin/sync/assignments", method, body)); return { status: response.status, body: await response.json() }; };

test("an admin can assign an operator a business, once; the account must be an operator and the business must exist", async () => {
  as("user_admin");
  assert.equal((await assign({ operatorId: "user_op2", merchantId: B })).status, 200);
  assert.deepEqual(fake.tables.sync_operator_assignments.filter((r) => r.operator_user_id === "user_op2").map((r) => r.merchant_id), [B]);
  assert.equal(audit()[0].action, "sync.assignment.add");
  const again = await assign({ operatorId: "user_op2", merchantId: B });
  assert.equal(again.body.created, false);
  assert.equal(fake.tables.sync_operator_assignments.filter((r) => r.operator_user_id === "user_op2").length, 1, "never twice");
  assert.equal((await assign({ operatorId: "user_cust", merchantId: B })).status, 400, "a customer is not an operator");
  assert.equal((await assign({ operatorId: "user_admin2", merchantId: B })).status, 400, "nor is an admin");
  assert.equal((await assign({ operatorId: "user_op2", merchantId: "77777777-7777-4777-8777-777777777777" })).status, 404);
  assert.equal((await assign({ operatorId: "bad id", merchantId: B })).status, 400);
});

test("taking a business off an operator removes it, keeps their tasks, and is recorded; the operator then no longer sees it", async () => {
  seedTask({ title: "for A", assignee_user_id: "user_op1" });
  as("user_admin");
  assert.equal((await assign({ operatorId: "user_op1", merchantId: A }, "DELETE")).status, 200);
  assert.equal(fake.tables.sync_operator_assignments.length, 0);
  assert.equal(fake.tables.sync_tasks.length, 1, "the task is still there");
  assert.equal(audit()[0].action, "sync.assignment.remove");
  as("user_op1");
  assert.deepEqual((await list()).body.tasks, []);
});

test("only an admin can assign", async () => {
  for (const [who, status] of [["user_op1", 403], ["user_cust", 403], [null, 401]]) {
    as(who);
    assert.equal((await assign({ operatorId: "user_op1", merchantId: B })).status, status, String(who));
    assert.equal((await assign({ operatorId: "user_op1", merchantId: A }, "DELETE")).status, status, String(who));
  }
  assert.equal(fake.tables.sync_operator_assignments.length, 1);
});

// ---------- an operator editing a business ----------

test("an operator can edit the details of an assigned business, never its tag, and never another business", async () => {
  const put = async (id, body) => (await merchantPut(json(`/api/admin/sync/merchants/${id}`, "PUT", body), ctx(id))).status;
  as("user_op1");
  assert.equal(await put(A, { about: "A calm cafe." }), 200);
  assert.equal(fake.tables.sync_merchants.find((m) => m.id === A).about, "A calm cafe.");
  assert.equal(await put(A, { status: "cancelled" }), 403, "removing the tag is for admins");
  assert.equal(await put(A, { status: "active" }), 403, "so is restoring it");
  assert.equal(fake.tables.sync_merchants.find((m) => m.id === A).status, "active");
  assert.equal(await put(B, { about: "Not mine." }), 404, "an unassigned business looks like a missing one");
  assert.equal(fake.tables.sync_merchants.find((m) => m.id === B).about, "");
  as("user_cust");
  assert.equal(await put(A, { about: "x" }), 403);
  as(null);
  assert.equal(await put(A, { about: "x" }), 401);
  as("user_admin");
  assert.equal(await put(A, { status: "cancelled" }), 200, "an admin still can");
});

test("if an operator's assignments cannot be read, editing a business is refused, never allowed", async () => {
  const put = async (id, body) => (await merchantPut(json(`/api/admin/sync/merchants/${id}`, "PUT", body), ctx(id))).status;
  as("user_op1");
  fake.failReadsFrom = "sync_operator_assignments";
  assert.equal(await put(A, { about: "should not save" }), 404);
  assert.equal(fake.tables.sync_merchants.find((m) => m.id === A).about, "");
});
