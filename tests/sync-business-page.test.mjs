// Patch 14b: the Businesses list (stage chips and search), the tabs on one business's page, and deleting a business.
// The rules are pure and checked first, then the delete route, then the screens' wiring and who may see what.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const L = await import("../lib/sync/listFilter.js");
const T = await import("../lib/sync/businessTabs.js");
const { POST: removeRoute } = await import("../app/api/admin/sync/merchants/[id]/remove/route.js");

const read = (file) => fs.readFileSync(file, "utf8");
const at = (y, m, d, h = 6, min = 0) => Date.UTC(y, m - 1, d, h, min);
const NOW = at(2026, 11, 17);

// ---------- the list: filter and search ----------

const merchants = [
  { id: "a", business_name: "Himal Brew House", area: "Thamel", topic_slug: "himal-brew-house-thamel", slug: "himal-brew-house" },
  { id: "b", business_name: "Ram Cafe", area: "Patan", topic_slug: "ram-cafe-patan", slug: "ram-cafe" },
  { id: "c", business_name: "Sita Momo", area: "Thamel", topic_slug: "sita-momo-thamel", slug: "sita-momo" },
  { id: "d", business_name: "No Stage Yet", area: "Boudha", topic_slug: "no-stage-yet", slug: "no-stage-yet" }
];
const rows = new Map([
  ["a", { id: "a", stage: "active", trial_started_on: "2026-09-01", trial_ends_on: "2026-11-30" }],
  ["b", { id: "b", stage: "wip", trial_started_on: "2026-11-01", trial_ends_on: "2027-01-30" }],
  ["c", { id: "c", stage: "wip", trial_started_on: "2026-07-01", trial_ends_on: "2026-09-29" }] // ended: Free by computation
]);

test("the address chooses the stage and the search, and anything odd means all businesses", () => {
  assert.deepEqual(L.parseListQuery({ stage: "wip", q: "  ram  " }), { stage: "wip", q: "ram" });
  assert.deepEqual(L.parseListQuery({ stage: "ACTIVE" }), { stage: "active", q: "" });
  for (const odd of [undefined, null, {}, { stage: "paid" }, { stage: "" }, { stage: ["bogus"] }, { stage: "all; drop table" }, "string", 7]) assert.equal(L.parseListQuery(odd).stage, "all", JSON.stringify(odd));
  assert.deepEqual(L.parseListQuery({ stage: ["free", "wip"], q: ["x", "y"] }), { stage: "free", q: "x" }, "a repeated parameter uses the first");
  assert.equal(L.parseListQuery({ q: "a".repeat(500) }).q.length, L.SEARCH_MAX);
  assert.equal(L.parseListQuery({ q: "a   b\n c" }).q, "a b c");
});

test("a trial that has ended counts as Free in the list, the same as on the business page", () => {
  assert.equal(L.stageOf(rows.get("c"), NOW), "free");
  assert.equal(L.stageOf(rows.get("b"), NOW), "wip");
  assert.equal(L.stageOf(rows.get("a"), NOW), "active");
  assert.equal(L.stageOf(undefined, NOW), "unknown");
});

test("each chip filters to its stage, and a business with no readable stage is under All only", () => {
  const ids = (stage, q = "") => L.filterBusinesses(merchants, rows, { stage, q }, NOW).map((m) => m.id);
  assert.deepEqual(ids("all"), ["a", "b", "c", "d"]);
  assert.deepEqual(ids("active"), ["a"]);
  assert.deepEqual(ids("wip"), ["b"]);
  assert.deepEqual(ids("free"), ["c"]);
});

test("search matches the name, the area and the addresses, in any case, and not what is not there", () => {
  const ids = (q, stage = "all") => L.filterBusinesses(merchants, rows, { stage, q }, NOW).map((m) => m.id);
  assert.deepEqual(ids("HIMAL"), ["a"]);
  assert.deepEqual(ids("thamel"), ["a", "c"]);
  assert.deepEqual(ids("thamel", "wip"), [], "search and chip work together");
  assert.deepEqual(ids("thamel", "free"), ["c"]);
  assert.deepEqual(ids("boudha"), ["d"]);
  assert.deepEqual(ids("ram-cafe"), ["b"]);
  assert.deepEqual(ids("zzz"), []);
  assert.deepEqual(ids("%"), [], "a wildcard is just a character");
});

test("the chips' counts follow the search and add up to what is on screen", () => {
  assert.deepEqual(L.stageCounts(merchants, rows, "", NOW), { all: 4, wip: 1, active: 1, free: 1 });
  assert.deepEqual(L.stageCounts(merchants, rows, "thamel", NOW), { all: 2, wip: 0, active: 1, free: 1 });
  assert.deepEqual(L.stageCounts([], rows, "", NOW), { all: 0, wip: 0, active: 0, free: 0 });
  assert.deepEqual(L.stageCounts(null, null, "", NOW), { all: 0, wip: 0, active: 0, free: 0 });
});

test("a chip's address keeps the search, and all with no search is the plain list", () => {
  assert.equal(L.listHref("all", ""), "/admin/sync/businesses");
  assert.equal(L.listHref("wip", ""), "/admin/sync/businesses?stage=wip");
  assert.equal(L.listHref("active", "ram cafe"), "/admin/sync/businesses?stage=active&q=ram+cafe");
  assert.equal(L.listHref("all", "a&b=c"), "/admin/sync/businesses?q=a%26b%3Dc", "typed text cannot add parameters");
});

// ---------- the tabs ----------

test("an admin has four tabs and an operator three, without the admin-only KastoChha tab", () => {
  assert.deepEqual(T.tabsFor(true).map((t) => t.id), ["overview", "kastochha", "tasks", "setup"]);
  assert.deepEqual(T.tabsFor(false).map((t) => t.id), ["overview", "tasks", "setup"]);
});

test("an unknown tab, or one an operator may not open, shows Overview", () => {
  assert.equal(T.resolveTab("tasks", true), "tasks");
  assert.equal(T.resolveTab("SETUP", false), "setup");
  assert.equal(T.resolveTab("kastochha", true), "kastochha");
  assert.equal(T.resolveTab("kastochha", false), "overview", "an operator is not let into the QR, owner and badge tab");
  for (const odd of [undefined, null, "", "google", "../x", ["tasks"].length, {}]) assert.equal(T.resolveTab(odd, true), "overview", String(odd));
  assert.equal(T.resolveTab(["tasks", "setup"], true), "tasks");
});

test("a tab's address, and the Google button only for a real https link", () => {
  assert.equal(T.tabHref("abc", "overview"), "/admin/sync/abc");
  assert.equal(T.tabHref("abc", "setup"), "/admin/sync/abc?tab=setup");
  assert.equal(T.googleLink({ google_maps_url: "https://maps.app.goo.gl/x", google_review_url: "https://g.page/r/y/review" }), "https://maps.app.goo.gl/x");
  assert.equal(T.googleLink({ google_maps_url: "", google_review_url: "https://g.page/r/y/review" }), "https://g.page/r/y/review");
  for (const bad of [{}, { google_maps_url: "javascript:alert(1)" }, { google_maps_url: "http://insecure.example" }, { google_maps_url: "not a link" }, null]) assert.equal(T.googleLink(bad), "", JSON.stringify(bad));
});

// ---------- deleting a business ----------

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const as = (userId, role) => { globalThis.__KC_TEST__ = { userId, roles: userId ? { [userId]: role } : {}, cookies: {}, revalidatedPaths: [] }; };
const seed = (id = ID, name = "Student life in the UK") => fake.tables.sync_merchants.push({ id, slug: "student-life", topic_slug: "student-life-in-the-uk", business_name: name, area: "UK", status: "cancelled", about: "" });
beforeEach(() => { fake.reset(); as("user_admin", "admin"); });
const post = async (body, id = ID) => { const response = await removeRoute(new Request("https://www.kastochhanepal.com/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: { id } }); return { status: response.status, body: await response.json() }; };
const ids = () => fake.tables.sync_merchants.map((m) => m.id);

test("only an admin can delete a business: signed out, an ordinary user and an operator are refused, and nothing is deleted", async () => {
  seed();
  for (const [who, role, status] of [[null, null, 401], ["user_cust", "user", 403], ["user_op", "operator", 403]]) {
    as(who, role);
    assert.equal((await post({ confirmName: "Student life in the UK" })).status, status, String(who));
  }
  assert.deepEqual(ids(), [ID]);
  assert.equal(fake.tables.admin_audit_log.length, 0);
});

test("the name must be typed exactly: nothing, another name, or a different case deletes nothing", async () => {
  seed();
  for (const typed of [undefined, "", "   ", "Student life", "student life in the uk", "Student life in the UK!", 5, null]) {
    const result = await post({ confirmName: typed });
    assert.equal(result.status, 400, String(typed));
  }
  assert.deepEqual(ids(), [ID]);
  assert.equal(fake.tables.admin_audit_log.length, 0, "a refused request leaves no record of a delete");
});

test("a bad id is 400 and a missing business 404", async () => {
  seed();
  assert.equal((await post({ confirmName: "x" }, "nope")).status, 400);
  assert.equal((await post({ confirmName: "x" }, OTHER)).status, 404);
  assert.deepEqual(ids(), [ID]);
});

test("the right name deletes that one business only, and the delete is recorded before it happens", async () => {
  seed();
  seed(OTHER, "Ram Cafe");
  const result = await post({ confirmName: "  Student life in the UK  " });
  assert.equal(result.status, 200);
  assert.deepEqual(ids(), [OTHER], "only the chosen business went");
  const log = fake.tables.admin_audit_log;
  assert.equal(log.length, 1);
  assert.deepEqual([log[0].action, log[0].actor_id, log[0].target_id, log[0].status], ["sync.merchant.delete", "user_admin", ID, "applied"]);
  assert.equal(log[0].before.business_name, "Student life in the UK", "what was deleted can still be seen");
  assert.equal(log[0].after, null);
});

test("if the record cannot be written to the audit log, nothing is deleted", async () => {
  seed();
  fake.failWritesTo = "admin_audit_log";
  const result = await post({ confirmName: "Student life in the UK" });
  assert.equal(result.status, 500);
  assert.match(result.body.error, /audit log/);
  assert.deepEqual(ids(), [ID]);
});

test("if the delete itself fails, the business stays and the log says it was not applied", async () => {
  seed();
  fake.failWritesTo = "sync_merchants";
  const result = await post({ confirmName: "Student life in the UK" });
  assert.equal(result.status, 500);
  assert.deepEqual(ids(), [ID]);
  assert.equal(fake.tables.admin_audit_log[0].status, "failed");
});

test("deleting does not touch the thread's posts", async () => {
  seed();
  fake.tables.reviews.push({ id: "r1", topic_slug: "student-life-in-the-uk", topic: "Student life in the UK", title: "Student life in the UK", summary: "Rent is high", kind: "experience", category: "Other" });
  assert.equal((await post({ confirmName: "Student life in the UK" })).status, 200);
  assert.equal(fake.tables.reviews.length, 1);
});

// ---------- the screens ----------

test("the delete route lives apart from the one an operator may use, and asks for an admin", () => {
  const route = read("app/api/admin/sync/merchants/[id]/remove/route.js");
  assert.match(route, /requireRole\(ROLE\.ADMIN\)/);
  assert.ok(!/syncAccess/.test(route));
  assert.ok(!/export async function (DELETE|PUT)/.test(read("app/api/admin/sync/merchants/[id]/route.js").replace(/export async function PUT/, "")), "the operator-reachable route has no delete");
});

test("the business page is tabbed, reads admin-only data only on admin-only tabs, and gives an operator none of it", () => {
  const page = read("app/admin/sync/[id]/page.js");
  assert.match(page, /resolveTab\(searchParams\?\.tab, access\.isAdmin\)/);
  assert.match(page, /tab === "kastochha" && access\.isAdmin/, "the QR, owner and badge tab is opened for admins only");
  const setup = page.slice(page.indexOf("async function SetupTab"), page.indexOf("// ---------- KastoChha"));
  assert.ok(setup.indexOf("if (!isAdmin) return") !== -1 && setup.indexOf("if (!isAdmin) return") < setup.indexOf("operatorsOfMerchant"), "an operator is returned the details form before anything admin-only is read");
  assert.ok(!/DeletePanel|AssignmentsPanel/.test(setup.slice(0, setup.indexOf("if (!isAdmin) return") + 120)), "an operator is shown neither assignments nor delete");
  assert.match(page, /Open on Google/);
  assert.match(page, /rel="noopener noreferrer"/);
});

test("the list page reads the filter from the address and shows an empty-search message", () => {
  const page = read("app/admin/sync/businesses/page.js");
  assert.match(page, /parseListQuery\(searchParams\)/);
  assert.match(page, /filterBusinesses\(/);
  assert.match(page, /No business matches/);
  assert.match(page, /method="get"/);
});

test("the delete box holds its button until the name is typed exactly, and goes to the list afterwards", () => {
  const panel = read("app/admin/sync/[id]/DeletePanel.js");
  assert.match(panel, /disabled=\{!ready \|\| busy\}/);
  assert.match(panel, /typed\.trim\(\) === businessName\.trim\(\)/);
  assert.match(panel, /\/api\/admin\/sync\/merchants\/\$\{merchantId\}\/remove/);
  assert.match(panel, /router\.push\("\/admin\/sync\/businesses"\)/);
});
