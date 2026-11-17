// Patch 14c: the Plan tab (and the history of stage moves) and the page families (the hotel switch).

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const F = await import("../lib/sync/families.js");
const H = await import("../lib/sync/stageHistory.js");
const { BUSINESS_TYPES } = await import("../lib/sync/businessTypes.js");
const { TASK_TYPE_LABELS } = await import("../lib/sync/tasks.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");

const read = (file) => fs.readFileSync(file, "utf8");

// ---------- families: the hotel switch ----------

test("a hotel and a homestay get the Hotel page, the food types get the Food page, everything else the general one", () => {
  assert.equal(F.familyOf("hotel"), "stay");
  assert.equal(F.familyOf("homestay"), "stay");
  for (const kind of ["cafe", "restaurant", "bakery", "bar", "sweet_shop"]) assert.equal(F.familyOf(kind), "food", kind);
  for (const kind of ["salon", "gym", "travel_agency", "mobile_shop", "garage", "grocery", "other_business"]) assert.equal(F.familyOf(kind), "general", kind);
});

test("an unknown, empty or odd type is the general page, never a crash", () => {
  for (const odd of [undefined, null, "", "Hotel", " hotel", "hotel ", "motel", 7, {}, []]) assert.equal(F.familyOf(odd), "general", String(odd));
});

test("every type the system lists has a family with a page name, a word for its list, and a checklist", () => {
  for (const type of BUSINESS_TYPES) {
    const info = F.familyInfo(type.key);
    assert.ok(info.pageLabel && info.itemsWord, type.key);
    assert.ok(info.steps.length >= 3, type.key);
    assert.ok(info.steps.every((step) => typeof step === "string" && step.length > 5), type.key);
  }
});

test("a hotel's page talks about rooms and rates, never a menu; a cafe's talks about the menu, never rooms", () => {
  const hotel = F.familyInfo("hotel");
  const cafe = F.familyInfo("cafe");
  assert.equal(hotel.pageLabel, "Hotel page");
  assert.match(hotel.steps.join(" "), /room/i);
  assert.doesNotMatch(hotel.steps.join(" "), /menu/i);
  assert.match(cafe.steps.join(" "), /menu/i);
  assert.doesNotMatch(cafe.steps.join(" "), /room/i);
});

test("the stored task type 'menu' is shown in the family's own words, and every other type is unchanged", () => {
  assert.equal(F.taskTypeLabel("menu", TASK_TYPE_LABELS, "hotel"), "Rooms and rates");
  assert.equal(F.taskTypeLabel("menu", TASK_TYPE_LABELS, "cafe"), "Menu");
  assert.equal(F.taskTypeLabel("menu", TASK_TYPE_LABELS, "salon"), "Services");
  assert.equal(F.taskTypeLabel("hours", TASK_TYPE_LABELS, "hotel"), "Hours");
  assert.equal(F.taskTypeLabel("nonsense", TASK_TYPE_LABELS, "hotel"), "Other");
});

// ---------- the history of stage moves ----------

test("each kind of move reads as one plain line, and anything else is blank", () => {
  assert.equal(H.describeMove({ action: "sync.stage.make_active" }), "Made Active");
  assert.equal(H.describeMove({ action: "sync.stage.move_to_free" }), "Moved to Free");
  assert.equal(H.describeMove({ action: "sync.stage.start_trial", after: { trial_ends_on: "2027-02-15" } }), "Started a new trial, ending 15 Feb 2027");
  assert.equal(H.describeMove({ action: "sync.stage.change_end_date", after: { trial_ends_on: "2027-03-01" } }), "Changed the trial's end date to 1 Mar 2027");
  assert.equal(H.describeMove({ action: "sync.stage.start_trial" }), "Started a new trial");
  for (const other of [{ action: "sync.merchant.update" }, { action: "" }, {}, null, undefined]) assert.equal(H.describeMove(other), "", JSON.stringify(other));
});

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
beforeEach(() => fake.reset());

const ID = "11111111-1111-4111-8111-111111111111";
const entry = (o) => ({ id: `e${fake.tables.admin_audit_log.length}`, created_at: "2026-11-17T06:00:00Z", actor_id: "user_admin", action: "sync.stage.make_active", target_type: "sync_merchant", target_id: ID, before: null, after: {}, status: "applied", ...o });

test("the history is this business's applied stage moves, newest first, in Nepal dates", async () => {
  fake.tables.admin_audit_log.push(
    entry({ id: "old", created_at: "2026-11-01T06:00:00Z", action: "sync.stage.start_trial", after: { trial_ends_on: "2027-01-30" } }),
    entry({ id: "new", created_at: "2026-11-17T18:30:00Z", action: "sync.stage.make_active" }) // 18:30 UTC is already the 18th in Nepal
  );
  const rows = await H.readStageHistory(createServerSupabase(), ID);
  assert.deepEqual(rows.map((r) => r.id), ["new", "old"]);
  assert.equal(rows[0].when, "18 Nov 2026");
  assert.equal(rows[0].text, "Made Active");
  assert.equal(rows[0].actorId, "user_admin");
});

test("another business's moves, moves that did not go through, and other kinds of log entry never appear", async () => {
  fake.tables.admin_audit_log.push(
    entry({ id: "mine" }),
    entry({ id: "other-business", target_id: "99999999-9999-4999-8999-999999999999" }),
    entry({ id: "failed", status: "failed" }),
    entry({ id: "pending", status: "pending" }),
    entry({ id: "not-a-move", action: "sync.merchant.update" }),
    entry({ id: "not-a-merchant", target_type: "review" })
  );
  assert.deepEqual((await H.readStageHistory(createServerSupabase(), ID)).map((r) => r.id), ["mine"]);
});

test("only the latest ten are read, and a database problem is raised, not shown as an empty history", async () => {
  for (let i = 0; i < 14; i++) fake.tables.admin_audit_log.push(entry({ id: `m${i}`, created_at: `2026-11-${String(i + 1).padStart(2, "0")}T06:00:00Z` }));
  assert.equal((await H.readStageHistory(createServerSupabase(), ID)).length, 10);
  fake.failReadsFrom = "admin_audit_log";
  await assert.rejects(() => H.readStageHistory(createServerSupabase(), ID), /history could not be read/);
});

// ---------- the screens ----------

test("the Plan tab holds the stage panel, reads the history for an admin only, and says when it cannot", () => {
  const page = read("app/admin/sync/[id]/page.js");
  const plan = page.slice(page.indexOf("async function PlanTab"), page.indexOf("// ---------- Tasks"));
  assert.match(plan, /if \(isAdmin\) \{\s*try \{\s*history = await readStageHistory/, "an operator's plan never reads the history");
  assert.match(plan, /<StagePanel merchantId=\{merchant\.id\} info=\{stage\} isAdmin=\{isAdmin\} \/>/);
  assert.match(plan, /Could not load the history/);
  assert.match(plan, /\{isAdmin \? \(/, "the history panel is drawn for an admin only");
});

test("the Overview names the page type and the checklist from the family, and the Tasks tab uses the family's words", () => {
  const page = read("app/admin/sync/[id]/page.js");
  assert.match(page, /familyInfo\(merchant\.business_kind\)/);
  assert.match(page, /family\.steps\.map/);
  assert.match(page, /taskTypeLabel\(task\.task_type, TASK_TYPE_LABELS, merchant\.business_kind\)/);
  assert.ok(!/<StagePanel/.test(page.slice(page.indexOf("function OverviewTab"), page.indexOf("async function PlanTab"))), "the stage panel lives in Plan now, not twice");
});
