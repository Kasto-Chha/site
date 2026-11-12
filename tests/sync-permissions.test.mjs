// Patch 13: who can reach what. The new operator role is the first role between an ordinary user and an admin, so the risk
// is an operator reaching something only an admin should. This lists EVERY admin route and page and checks it, so a route
// added later cannot become reachable by an operator by accident.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { hasRole, normalizeRole, ROLE } = await import("../lib/auth/roles.js");

const read = (file) => fs.readFileSync(file, "utf8");
function files(dir, name) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(full, name));
    else if (entry.name === name) out.push(full);
  }
  return out.sort();
}
const ROUTES = files("app/api/admin", "route.js");
const PAGES = files("app/admin", "page.js");

// The ONLY places an operator is let in. Each is limited again inside (to assigned businesses, with no tag changes).
const OPERATOR_ROUTE_METHODS = new Set([
  "app/api/admin/sync/tasks/route.js:GET",
  "app/api/admin/sync/tasks/route.js:POST",
  "app/api/admin/sync/tasks/[id]/route.js:PATCH",
  "app/api/admin/sync/merchants/[id]/route.js:PUT"
]);
const OPERATOR_PAGES = new Set(["app/admin/sync/tasks/page.js", "app/admin/sync/businesses/page.js", "app/admin/sync/[id]/page.js"]);

// ---------- the roles ----------

test("the roles rank user, operator, admin, super admin, so everything that asks for admin stays closed to an operator", () => {
  assert.equal(hasRole(ROLE.OPERATOR, ROLE.ADMIN), false);
  assert.equal(hasRole(ROLE.OPERATOR, ROLE.SUPER_ADMIN), false);
  assert.equal(hasRole(ROLE.OPERATOR, ROLE.OPERATOR), true);
  assert.equal(hasRole(ROLE.OPERATOR, ROLE.USER), true);
  assert.equal(hasRole(ROLE.USER, ROLE.OPERATOR), false);
  assert.equal(hasRole(ROLE.ADMIN, ROLE.OPERATOR), true, "an admin can do whatever an operator can");
  assert.equal(hasRole(ROLE.SUPER_ADMIN, ROLE.ADMIN), true);
  assert.equal(hasRole(ROLE.ADMIN, ROLE.SUPER_ADMIN), false);
});

test("an unknown, misspelled or empty role is an ordinary user, never an operator or an admin", () => {
  for (const odd of [undefined, null, "", "Operator", " operator", "operator ", "OPERATOR", "root", "administrator", 7, {}]) assert.equal(normalizeRole(odd), ROLE.USER, String(odd));
  assert.equal(normalizeRole("operator"), ROLE.OPERATOR);
  assert.equal(normalizeRole("admin"), ROLE.ADMIN);
});

// ---------- the code: every admin page and route, and who is let in ----------

test("every admin route asks for an admin, except the four handlers an operator is meant to reach, which ask for the team", () => {
  assert.ok(ROUTES.length >= 17, "the list of routes was found");
  for (const file of ROUTES) {
    const text = read(file);
    const usesTeamGate = /\bsyncAccess\(\)/.test(text);
    const operatorHere = [...OPERATOR_ROUTE_METHODS].some((entry) => entry.startsWith(`${file}:`));
    if (operatorHere) assert.ok(usesTeamGate, `${file} is meant for the team and should use syncAccess`);
    else {
      assert.ok(!usesTeamGate, `${file} lets an operator in and is not on the list`);
      assert.match(text, /requireRole\(ROLE\.(ADMIN|SUPER_ADMIN)\)/, `${file} must require an admin`);
    }
    assert.ok(!/ROLE\.OPERATOR\)\s*;?\s*\n\s*if \(!/.test(text) || operatorHere, `${file} asks for the operator role directly`);
  }
});

test("every admin page asks for an admin, except the three an operator is meant to reach", () => {
  assert.ok(PAGES.length >= 12);
  for (const file of PAGES) {
    const text = read(file);
    if (OPERATOR_PAGES.has(file)) assert.match(text, /\bsyncAccess\(\)/, `${file} is meant for the team`);
    else {
      assert.match(text, /requireRole\(ROLE\.(ADMIN|SUPER_ADMIN)\)/, `${file} must require an admin`);
      // The Overview asks syncAccess only to send an operator elsewhere, after its own admin check has failed.
      if (file !== "app/admin/sync/page.js") assert.ok(!/\bsyncAccess\(\)/.test(text), `${file} lets an operator in`);
    }
  }
});

test("no file outside the known few lets an operator in", () => {
  const found = [];
  for (const dir of ["app", "lib"]) for (const file of [...files(dir, "page.js"), ...files(dir, "route.js"), ...files(dir, "layout.js")]) if (/await syncAccess\(\)/.test(read(file))) found.push(file);
  assert.deepEqual(found.sort(), [
    "app/admin/sync/[id]/page.js", "app/admin/sync/businesses/page.js", "app/admin/sync/layout.js", "app/admin/sync/page.js", "app/admin/sync/tasks/page.js",
    "app/api/admin/sync/merchants/[id]/route.js", "app/api/admin/sync/tasks/[id]/route.js", "app/api/admin/sync/tasks/route.js"
  ].sort());
  assert.deepEqual(files("lib", "access.js"), ["lib/sync/access.js"], "and the check itself lives in one file");
  // The two places that ask for the operator role by name do so to check or change it, behind an admin gate.
  for (const file of ["app/api/admin/sync/team/operators/route.js", "app/api/admin/sync/assignments/route.js", "app/admin/sync/team/page.js"]) assert.match(read(file), /requireRole\(ROLE\.ADMIN\)/, file);
});

test("the operator pages show an operator only their own: the lists and the business page limit themselves, and fail closed", () => {
  assert.match(read("app/admin/sync/businesses/page.js"), /if \(!access\.isAdmin\) \{\s*try \{\s*onlyIds = await assignedMerchantIds\(createServerSupabase\(\), access\.userId\);/, "an operator's list is limited to their assigned businesses");
  assert.match(read("app/admin/sync/businesses/page.js"), /listMerchantsForAdmin\(\{ onlyIds \}\)/);
  assert.match(read("app/admin/sync/businesses/page.js"), /catch \{\s*onlyIds = \[\];/, "unreadable assignments show none, never all");
  assert.match(read("app/admin/sync/[id]/page.js"), /access\.isAdmin \|\| \(await isAssigned\(/);
  assert.match(read("app/admin/sync/tasks/page.js"), /scopeFor\(supabase, access\)/);
  assert.match(read("app/admin/sync/[id]/page.js"), /if \(!access\.isAdmin\) \{\s*return \(/, "an operator's version returns before any admin-only panel is read");
});

// ---------- the routes, run: nobody is let in who should not be ----------

const fake = new FakePostgrest();
fake.withDiscussionThreads = true;
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
beforeEach(() => fake.reset());

const ID = "11111111-1111-4111-8111-111111111111";
const as = (userId, role) => { globalThis.__KC_TEST__ = { userId, roles: userId ? { [userId]: role } : {}, cookies: {}, revalidatedPaths: [] }; };
const call = async (handler, method) => {
  const request = new Request("https://www.kastochhanepal.com/api/admin/x", { method, headers: { "content-type": "application/json" }, body: method === "GET" || method === "HEAD" ? undefined : "{}" });
  const response = await handler(request, { params: { id: ID, type: "featured", qrId: ID, code: "abc12345" } });
  return response.status;
};

test("every admin route, run as a signed-out visitor, an ordinary user and an operator, refuses all but the four handlers meant for the team, and changes nothing", async () => {
  let checked = 0;
  for (const file of ROUTES) {
    const mod = await import(`../${file}`);
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      if (typeof mod[method] !== "function") continue;
      const key = `${file}:${method}`;
      fake.reset();
      as(null);
      assert.equal(await call(mod[method], method), 401, `${key} signed out`);
      as("user_cust", "user");
      assert.equal(await call(mod[method], method), 403, `${key} as an ordinary user`);
      as("user_op", "operator");
      const status = await call(mod[method], method);
      if (OPERATOR_ROUTE_METHODS.has(key)) assert.ok(status !== 401 && status !== 403, `${key} should let an operator in (got ${status})`);
      else assert.equal(status, 403, `${key} as an operator`);
      checked += 1;
    }
  }
  assert.ok(checked >= 25, `${checked} handlers were checked`);
});

test("a refused request changes nothing: no database write, no role change, no audit entry", async () => {
  for (const file of ROUTES) {
    const mod = await import(`../${file}`);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      if (typeof mod[method] !== "function" || OPERATOR_ROUTE_METHODS.has(`${file}:${method}`)) continue;
      fake.reset();
      as("user_op", "operator");
      await call(mod[method], method);
      as("user_cust", "user");
      await call(mod[method], method);
      as(null);
      await call(mod[method], method);
      const writes = fake.requests.filter((r) => r.method !== "GET" && r.method !== "HEAD");
      assert.deepEqual(writes, [], `${file}:${method} wrote something for a refused caller`);
      assert.equal(globalThis.__KC_TEST__.metadataWrites, undefined, `${file}:${method} changed a role`);
    }
  }
});

// ---------- what each role is shown ----------

test("the menu shows an operator only Tasks and Businesses, and an admin everything; showing a link never grants anything", async () => {
  const { navFor } = await import("../lib/sync/nav.js");
  assert.deepEqual(navFor(false).map((item) => item.label), ["Tasks", "Businesses"]);
  assert.deepEqual(navFor(true).map((item) => item.label), ["Overview", "Tasks", "Businesses", "Feedback", "Export", "Team", "Tag a business"]);
});

test("the screens' wiring: Delete only for an admin, an operator can only give a task to themselves, a note's task copies no contact, and the Overview tells operators where to go", () => {
  const tasks = read("app/admin/sync/tasks/TasksClient.js");
  assert.match(tasks, /\{isAdmin \? <button[^>]*onClick=\{\(\) => remove\(task\)\}/);
  const page = read("app/admin/sync/tasks/page.js");
  assert.match(page, /people = \[\{ id: access\.userId, label: "Me" \}\];\s*if \(access\.isAdmin\) \{/, "only an admin is offered other people");
  const inbox = read("app/admin/sync/feedback/FeedbackInbox.js");
  assert.match(inbox, /details: note\.message,/);
  assert.doesNotMatch(inbox.slice(inbox.indexOf("async function makeTask"), inbox.indexOf("async function copy")), /contact/, "the customer's contact details are never copied into a task");
  const overview = read("app/admin/sync/page.js");
  assert.match(overview, /if \(\(await syncAccess\(\)\)\.ok\) redirect\("\/admin\/sync\/tasks"\);/);
  assert.match(overview, /label="Tasks due today" value=\{formatCount\(tasksDue\)\}/);
  assert.match(read("app/admin/sync/team/page.js"), /Other admin accounts are managed on the Roles page\./);
});
