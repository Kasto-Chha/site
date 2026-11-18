// Patch 14m (part 1): the owner dashboard. An owner sees only their own business, only the owner-facing parts, and only the
// customer notes the team has passed on.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const O = await import("../lib/sync/owner.js");
const { PUT: statusRoute } = await import("../app/api/admin/sync/feedback/[id]/route.js");
const { POST: digestRoute } = await import("../app/api/admin/sync/feedback/digest/route.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");
const read = (file) => fs.readFileSync(file, "utf8");

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
const as = (userId, role) => { globalThis.__KC_TEST__ = { userId, roles: userId ? { [userId]: role } : {}, cookies: {}, revalidatedPaths: [] }; };
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const TODAY = "2026-11-17";
const supabase = () => createServerSupabase();
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const seed = (id, owner, extra = {}) => fake.tables.sync_merchants.push({ id, slug: `b-${id.slice(0, 4)}`, topic_slug: `t-${id.slice(0, 4)}`, business_name: id === A ? "Himal Brew House" : "Other Cafe", area: "Jhamsikhel", business_kind: "cafe", status: "active", owner_user_id: owner, ...extra });
const note = (merchant, status, shared, extra = {}) => fake.tables.sync_feedback.push({ id: uuid(), merchant_id: merchant, message: `msg-${n}`, contact: null, is_urgent: false, status, created_at: `2026-11-${String(10 + (n % 15)).padStart(2, "0")}T05:00:00Z`, handled_at: null, shared_with_owner_at: shared ? "2026-11-16T05:00:00Z" : null, ...extra });
beforeEach(() => { fake.reset(); n = 0; as("user_admin", "admin"); });

// ---------- who is the owner ----------

test("the businesses of an account are only its own, and carry nothing about who owns them", async () => {
  seed(A, "owner_1"); seed(B, "owner_2");
  const list = await O.listOwnedBusinesses(supabase(), "owner_1");
  assert.deepEqual(list, [{ id: A, name: "Himal Brew House", area: "Jhamsikhel" }]);
  assert.deepEqual(await O.listOwnedBusinesses(supabase(), "nobody"), []);
  for (const bad of ["", null, undefined, 5, {}]) assert.deepEqual(await O.listOwnedBusinesses(supabase(), bad), []);
  assert.ok(!JSON.stringify(list).includes("owner_"));
});

test("a business is shown to its owner only; a stranger, an unlinked business and a missing one all look the same", async () => {
  seed(A, "owner_1"); seed(B, null);
  const own = await O.getOwnedBusiness(supabase(), "owner_1", A);
  assert.equal(own.business_name, "Himal Brew House");
  assert.ok(!("owner_user_id" in own));
  assert.equal(await O.getOwnedBusiness(supabase(), "owner_2", A), null);
  assert.equal(await O.getOwnedBusiness(supabase(), "owner_1", B), null);
  assert.equal(await O.getOwnedBusiness(supabase(), "owner_1", uuid()), null);
  for (const bad of [[null, A], ["", A], [undefined, A], ["owner_1", 5], ["owner_1", null]]) assert.equal(await O.getOwnedBusiness(supabase(), ...bad), null, JSON.stringify(bad));
  // an unlinked business must never match an empty or missing account
  assert.equal(await O.getOwnedBusiness(supabase(), "", B), null);
});

// ---------- the inbox ----------

test("the owner gets only notes the team passed on: never a new one, never one resolved without being passed on, never another business's", async () => {
  seed(A, "owner_1"); seed(B, "owner_2");
  note(A, "in_digest", true, { message: "SHOWN passed on" });
  note(A, "resolved", true, { message: "SHOWN done" });
  note(A, "new", false, { message: "HIDDEN new" });
  note(A, "new", true, { message: "HIDDEN new with a stale stamp" });
  note(A, "in_digest", false, { message: "HIDDEN in digest but not stamped" });
  note(A, "resolved", false, { message: "HIDDEN resolved without being passed on" });
  note(B, "in_digest", true, { message: "HIDDEN other business" });
  const notes = await O.listOwnerNotes(supabase(), A);
  assert.deepEqual(notes.map((x) => x.message).sort(), ["SHOWN done", "SHOWN passed on"]);
  assert.ok(!JSON.stringify(notes).includes("HIDDEN"));
  for (const x of notes) assert.deepEqual(Object.keys(x).sort(), ["contact", "created_at", "done", "id", "message", "urgent"], "no business id, no status internals");
});

test("urgent shows until resolved; contact shows when left; newest first; counts and filters agree", async () => {
  seed(A, "owner_1");
  note(A, "in_digest", true, { message: "old", is_urgent: true, created_at: "2026-11-01T05:00:00Z", contact: "9841 000 000" });
  note(A, "in_digest", true, { message: "new", created_at: "2026-11-09T05:00:00Z" });
  note(A, "resolved", true, { message: "done urgent", is_urgent: true, created_at: "2026-11-05T05:00:00Z" });
  const notes = await O.listOwnerNotes(supabase(), A);
  assert.deepEqual(notes.map((x) => x.message), ["new", "done urgent", "old"]);
  assert.equal(notes.find((x) => x.message === "old").contact, "9841 000 000");
  assert.equal(notes.find((x) => x.message === "done urgent").urgent, false);
  assert.deepEqual(O.noteCounts(notes), { all: 3, urgent: 1, done: 1 });
  assert.deepEqual(O.filterNotes(notes, "urgent").map((x) => x.message), ["old"]);
  assert.deepEqual(O.filterNotes(notes, "done").map((x) => x.message), ["done urgent"]);
  assert.equal(O.filterNotes(notes, "all").length, 3);
  assert.deepEqual(["urgent", "done", "all", "x", undefined, ["done"], ["zz"]].map(O.parseNoteFilter), ["urgent", "done", "all", "all", "all", "done", "all"]);
});

// ---------- the team's buttons release a note ----------

const put = (id, status) => statusRoute(new Request("https://www.kastochhanepal.com/x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) }), { params: { id } });
const row = (id) => fake.tables.sync_feedback.find((r) => r.id === id);

test("passing a note on stamps it, putting it back clears it, resolving keeps whatever it was", async () => {
  seed(A, "owner_1");
  note(A, "new", false); const id = fake.tables.sync_feedback[0].id;
  assert.equal(row(id).shared_with_owner_at, null);
  assert.equal((await put(id, "in_digest")).status, 200);
  const stamp = row(id).shared_with_owner_at;
  assert.ok(stamp);
  assert.equal((await put(id, "resolved")).status, 200);
  assert.equal(row(id).shared_with_owner_at, stamp, "passed on, then resolved: stays visible");
  assert.equal((await put(id, "new")).status, 200);
  assert.equal(row(id).shared_with_owner_at, null, "put back to new: hidden again");
  assert.equal((await put(id, "resolved")).status, 200);
  assert.equal(row(id).shared_with_owner_at, null, "resolved straight from new: never shown");
  assert.equal((await O.listOwnerNotes(supabase(), A)).length, 0);
});

test("marking a digest sent stamps every note it covers, and only those", async () => {
  seed(A, "owner_1"); seed(B, "owner_2");
  note(A, "new", false); note(A, "new", false); note(A, "resolved", false); note(B, "new", false);
  const res = await digestRoute(new Request("https://www.kastochhanepal.com/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ merchantId: A }) }));
  assert.equal(res.status, 200);
  const [a1, a2, resolved, other] = fake.tables.sync_feedback;
  assert.ok(a1.shared_with_owner_at && a2.shared_with_owner_at);
  assert.equal(resolved.shared_with_owner_at, null);
  assert.equal(other.shared_with_owner_at, null);
  assert.equal((await O.listOwnerNotes(supabase(), A)).length, 2);
  assert.equal((await O.listOwnerNotes(supabase(), B)).length, 0);
});

// ---------- the home ----------

const NUMBERS = (month, extra = {}) => fake.tables.sync_google_numbers.push({ merchant_id: A, month: `${month}-01`, calls: 100, directions: 200, profile_views: 3000, rating: 4.5, reviews: 80, note: "", ...extra });

test("a stranger gets nothing from the home; the owner gets the figures with the team's note removed", async () => {
  seed(A, "owner_1");
  NUMBERS("2026-10", { calls: 128, note: "TEAM ONLY NOTE" }); NUMBERS("2026-09");
  fake.tables.sync_tasks.push({ id: uuid(), merchant_id: A, title: "SECRET TASK TITLE", details: "PRIVATE DETAILS", task_type: "photos", status: "done", done_at: "2026-10-10T05:00:00Z", created_at: "2026-10-01T05:00:00Z" });
  fake.tables.sync_posts.push({ id: uuid(), merchant_id: A, title: "SECRET POST TITLE", body: "SECRET POST BODY", kind: "offer", status: "published", published_on: "2026-10-12", created_at: "x" });
  assert.equal(await O.ownerHome(supabase(), "owner_2", A, { today: TODAY }), null);
  assert.equal(await O.ownerHome(supabase(), "", A, { today: TODAY }), null);
  const home = await O.ownerHome(supabase(), "owner_1", A, { today: TODAY });
  assert.equal(home.business.name, "Himal Brew House");
  assert.equal(home.report.month, "2026-10");
  assert.equal(home.report.metrics[0].value, 128);
  assert.equal(home.report.note, "");
  assert.deepEqual(home.report.work.tasks.byType.map((t) => [t.label, t.n]), [["Photos", 1]]);
  assert.equal(home.report.work.posts.total, 1);
  const text = JSON.stringify(home);
  for (const secret of ["TEAM ONLY", "SECRET", "PRIVATE", "owner_1", "owner_user_id"]) assert.ok(!text.includes(secret), secret);
  assert.deepEqual(home.months, ["2026-10", "2026-09"]);
  assert.deepEqual(home.notes, { all: 0, urgent: 0, done: 0 });
});

test("the month asked for is used only if figures are typed for it, else the latest typed one", async () => {
  seed(A, "owner_1");
  NUMBERS("2026-10"); NUMBERS("2026-08", { calls: 50 });
  assert.equal((await O.ownerHome(supabase(), "owner_1", A, { month: "2026-08", today: TODAY })).report.metrics[0].value, 50);
  assert.equal((await O.ownerHome(supabase(), "owner_1", A, { month: "2026-07", today: TODAY })).report.month, "2026-10");
  assert.equal((await O.ownerHome(supabase(), "owner_1", A, { month: "nonsense", today: TODAY })).report.month, "2026-10");
  fake.tables.sync_google_numbers.length = 0;
  const empty = await O.ownerHome(supabase(), "owner_1", A, { today: TODAY });
  assert.equal(empty.report.hasNumbers, false);
  assert.equal(empty.report.month, "2026-10", "no figures: the report month is last month");
  assert.deepEqual(empty.months, []);
});

test("a Free business is marked so the owner is told, and an unreadable stage never blocks", async () => {
  seed(A, "owner_1", { stage: "free", trial_started_on: "2026-01-01", trial_ends_on: "2026-04-01" });
  assert.equal((await O.ownerHome(supabase(), "owner_1", A, { today: TODAY })).free, true);
  fake.reset(); as("user_admin", "admin"); seed(A, "owner_1");
  assert.equal((await O.ownerHome(supabase(), "owner_1", A, { today: TODAY })).free, false);
});

// ---------- the pages and the files ----------

test("the owner pages ask who is signed in, find the owner on the server, and are not the admin pages", () => {
  for (const file of ["app/owner/page.js", "app/owner/[id]/page.js", "app/owner/[id]/inbox/page.js", "app/owner/[id]/report/page.js"]) {
    const text = read(file);
    assert.match(text, /auth\(\)/, file);
    assert.ok(!/requireRole|syncAccess/.test(text), `${file} is not an admin page`);
    assert.ok(!/searchParams\??\.(userId|owner)/.test(text), `${file} takes no account from the address`);
  }
  assert.match(read("app/owner/[id]/page.js"), /ownerHome\(/);
  assert.match(read("app/owner/[id]/page.js"), /if \(!home\) notFound\(\)/);
  assert.match(read("app/owner/[id]/inbox/page.js"), /if \(!business\) notFound\(\)/);
  assert.match(read("app/owner/[id]/report/page.js"), /if \(!home\) notFound\(\)/);
  assert.match(read("app/owner/layout.js"), /NOINDEX_NOFOLLOW/);
  assert.ok(!/dangerouslySetInnerHTML/.test(["app/owner/page.js", "app/owner/[id]/page.js", "app/owner/[id]/inbox/page.js"].map(read).join("")));
});

test("the owner is kept out of search engines and sees no tasks or team notes", () => {
  assert.match(read("app/robots.txt/route.js"), /Disallow: \/owner/);
  const lib = read("lib/sync/owner.js");
  assert.match(lib, /report\.note = ""/);
  const pages = ["app/owner/page.js", "app/owner/[id]/page.js", "app/owner/[id]/inbox/page.js", "app/owner/[id]/report/page.js"].map(read).join("\n");
  assert.ok(!/sync_tasks|listTasks|sync_notes|admin_audit/.test(pages), "pages never read tasks, team notes or the audit log");
});

test("the migration adds one column, stamps only what the team already passed on, and is safe to replay", () => {
  const sql = read("supabase/migrations/0035_sync_feedback_shared.sql").replace(/--.*$/gm, "");
  assert.match(sql, /add column if not exists shared_with_owner_at timestamptz/i);
  assert.match(sql, /where status = 'in_digest' and shared_with_owner_at is null/i);
  assert.ok(!/resolved/i.test(sql), "resolved notes are not stamped");
  assert.ok(!/drop\s|delete\s+from|truncate/i.test(sql));
  const book = read("docs/sync/runbook.md");
  assert.match(book, /0035_sync_feedback_shared\.sql/);
  assert.match(book, /## The owner dashboard/);
});
