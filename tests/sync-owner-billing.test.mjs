// Patch 14r: what the owner sees about their plan and payments. Their own only; never a cancelled payment or any team words.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const OB = await import("../lib/sync/ownerBilling.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");
const read = (file) => fs.readFileSync(file, "utf8");

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";
const ACTIVE = { stage: "active", trial_started_on: "2026-01-01", trial_ends_on: "2026-04-01", stage_changed_at: "2026-03-20T05:00:00Z" };
const merchant = (id, owner, extra = {}) => fake.tables.sync_merchants.push({ id, slug: `b-${id.slice(0, 4)}`, topic_slug: `t-${id.slice(0, 4)}`, business_name: id === M1 ? "Himal Brew House" : "Other Cafe", area: "Jhamsikhel", business_kind: "cafe", status: "active", owner_user_id: owner, monthly_price: null, ...ACTIVE, ...extra });
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const payment = (m, extra = {}) => { const row = { id: uuid(), merchant_id: m, receipt_no: n, amount: 1500, months: 1, paid_on: "2026-04-02", period_from: "2026-04-01", period_to: "2026-04-30", method: "esewa", reference: "TX1", note: "TEAM NOTE", recorded_by: "user_admin", voided_at: null, void_reason: null, ...extra }; fake.tables.sync_payments.push(row); return row; };
const at = (iso) => Date.parse(`${iso}T06:00:00Z`);
const sb = () => createServerSupabase();
beforeEach(() => { fake.reset(); n = 0; merchant(M1, "owner_1"); merchant(M2, "owner_2"); fake.tables.sync_billing_settings.push({ id: 1, standard_monthly: 1500, instructions: "eSewa 9841000000", issuer: "KastoChha, Kathmandu" }); });

test("a plan is shown to its owner only: a stranger, an unlinked business, a missing one and a bad account all get nothing", async () => {
  assert.equal((await OB.ownerPlan(sb(), "owner_1", M1, { now: at("2026-04-10") })).business.name, "Himal Brew House");
  assert.equal(await OB.ownerPlan(sb(), "owner_2", M1), null);
  assert.equal(await OB.ownerPlan(sb(), "owner_1", M2), null);
  assert.equal(await OB.ownerPlan(sb(), "owner_1", uuid()), null);
  for (const bad of ["", null, undefined, 5]) assert.equal(await OB.ownerPlan(sb(), bad, M1), null, String(bad));
  fake.tables.sync_merchants[0].owner_user_id = null;
  assert.equal(await OB.ownerPlan(sb(), "", M1), null);
});

test("the owner sees the price, where they stand and how to pay when it matters, and only received payments", async () => {
  payment(M1, { period_to: "2026-04-30" });
  payment(M1, { period_from: "2026-05-01", period_to: "2026-05-31", receipt_no: 2 });
  payment(M1, { period_from: "2026-06-01", period_to: "2026-06-30", voided_at: "2026-05-02T00:00:00Z", void_reason: "SECRET REASON" });
  payment(M2, { amount: 99999 });
  const plan = await OB.ownerPlan(sb(), "owner_1", M1, { now: at("2026-06-10") });
  assert.equal(plan.state, "overdue");
  assert.equal(plan.price, 1500);
  assert.equal(plan.paidThrough, "2026-05-31");
  assert.equal(plan.howToPay, "eSewa 9841000000");
  assert.equal(plan.payments.length, 2, "the cancelled one and the other business's are not shown");
  const text = JSON.stringify(plan);
  for (const hidden of ["TEAM NOTE", "user_admin", "SECRET REASON", "99999", "owner_1", "owner_2", "recorded_by", "void", "merchant_id"]) assert.ok(!text.includes(hidden), hidden);
});

test("how to pay is shown only while a payment is due or coming up, and a free-of-charge or standard price is shown as it is", async () => {
  payment(M1, { period_to: "2026-12-31" });
  assert.equal((await OB.ownerPlan(sb(), "owner_1", M1, { now: at("2026-06-10") })).howToPay, "", "paid up: no payment instructions");
  assert.equal((await OB.ownerPlan(sb(), "owner_1", M1, { now: at("2026-12-28") })).howToPay, "eSewa 9841000000", "due soon");
  fake.tables.sync_merchants[0].monthly_price = 1200;
  assert.equal((await OB.ownerPlan(sb(), "owner_1", M1, { now: at("2026-06-10") })).price, 1200);
  fake.tables.sync_merchants[0].monthly_price = null;
  assert.equal((await OB.ownerPlan(sb(), "owner_1", M1, { now: at("2026-06-10") })).price, 1500);
});

test("a trial shows its end date and the price after it; a Free business owes nothing", async () => {
  Object.assign(fake.tables.sync_merchants[0], { stage: "wip", trial_ends_on: "2999-01-01" });
  const trial = await OB.ownerPlan(sb(), "owner_1", M1);
  assert.deepEqual([trial.state, trial.trialEnds, trial.price], ["trial", "2999-01-01", 1500]);
  Object.assign(fake.tables.sync_merchants[0], { stage: "free" });
  const free = await OB.ownerPlan(sb(), "owner_1", M1);
  assert.equal(free.state, "free");
  assert.equal(free.howToPay, "");
});

test("a receipt opens only for its owner, only for a payment of that business, and never a cancelled one", async () => {
  const mine = payment(M1); const cancelled = payment(M1, { voided_at: "2026-05-02T00:00:00Z", void_reason: "x" }); const theirs = payment(M2);
  const r = await OB.ownerReceipt(sb(), "owner_1", M1, mine.id);
  assert.deepEqual([r.number, r.amount, r.businessName, r.issuer, r.voided], ["KC-00001", 1500, "Himal Brew House", "KastoChha, Kathmandu", false]);
  assert.equal(await OB.ownerReceipt(sb(), "owner_2", M1, mine.id), null);
  assert.equal(await OB.ownerReceipt(sb(), "owner_1", M1, cancelled.id), null);
  assert.equal(await OB.ownerReceipt(sb(), "owner_1", M1, theirs.id), null, "another business's payment, asked through my own business");
  assert.equal(await OB.ownerReceipt(sb(), "owner_1", M1, uuid()), null);
  for (const bad of [null, undefined, 5, ""]) assert.equal(await OB.ownerReceipt(sb(), "owner_1", M1, bad), null, String(bad));
  assert.ok(!JSON.stringify(r).includes("TEAM NOTE") && !JSON.stringify(r).includes("user_admin"));
});

test("a database problem is thrown, not shown as an empty plan", async () => {
  fake.failReadsFrom = "sync_payments";
  await assert.rejects(() => OB.ownerPlan(sb(), "owner_1", M1));
  fake.failReadsFrom = null;
});

test("the owner pages sign in first, keep to the owner's own business, and use no admin code", () => {
  for (const file of ["app/owner/[id]/plan/page.js", "app/owner/[id]/receipt/[paymentId]/page.js"]) {
    const text = read(file);
    assert.match(text, /await auth\(\)/, file);
    assert.ok(!/requireRole|syncAccess|api\/admin/.test(text), `${file} touches admin code`);
  }
  assert.match(read("app/owner/[id]/receipt/[paymentId]/page.js"), /ownerReceipt\(createServerSupabase\(\), userId, params\.id, params\.paymentId\)/);
  assert.ok(read("app/owner/[id]/page.js").includes("/plan`"), "the home page links to the plan");
  assert.ok(read("docs/sync/runbook.md").includes("Your plan"));
});
