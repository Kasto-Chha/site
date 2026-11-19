// Patch 14q: billing, recorded by hand. Admin only; a payment is never deleted; who is paid, due or late is worked out from the dates.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const B = await import("../lib/sync/billing.js");
const { POST: payRoute, PATCH: voidRoute } = await import("../app/api/admin/sync/merchants/[id]/payments/route.js");
const { PUT: priceRoute } = await import("../app/api/admin/sync/merchants/[id]/price/route.js");
const { PUT: settingsRoute } = await import("../app/api/admin/sync/billing-settings/route.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");
const read = (file) => fs.readFileSync(file, "utf8");

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
const as = (userId, role) => { globalThis.__KC_TEST__ = { userId, roles: userId ? { [userId]: role } : {}, cookies: {}, revalidatedPaths: [] }; };
const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ACTIVE = { stage: "active", trial_started_on: "2026-01-01", trial_ends_on: "2026-04-01", stage_changed_at: "2026-03-20T05:00:00Z" };
const seed = (id = ID, extra = {}) => fake.tables.sync_merchants.push({ id, slug: `b-${id.slice(0, 4)}`, topic_slug: `t-${id.slice(0, 4)}`, business_name: id === ID ? "Himal Brew House" : "Other Cafe", area: "Jhamsikhel", status: "active", monthly_price: null, owner_whatsapp: null, ...ACTIVE, ...extra });
beforeEach(() => { fake.reset(); as("user_admin", "admin"); seed(); fake.tables.sync_billing_settings.push({ id: 1, standard_monthly: 1500, instructions: "eSewa 9841000000", issuer: "" }); });
const call = async (route, method, body, id = ID) => { const r = await route(new Request("https://www.kastochhanepal.com/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), { params: { id } }); return { status: r.status, body: await r.json() }; };
const pay = (b, id) => call(payRoute, "POST", b, id);
const cancel = (b, id) => call(voidRoute, "PATCH", b, id);
const rows = () => fake.tables.sync_payments;
const P = { amount: "1500", months: "1", method: "esewa", paid_on: "2026-04-02", period_from: "2026-04-01" };

// ---------- dates and money ----------

test("months add by calendar: a 31st lands on the last day, the year rolls over, and a period ends the day before the next begins", () => {
  assert.equal(B.addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(B.addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(B.addMonths("2026-12-15", 1), "2027-01-15");
  assert.equal(B.addMonths("2026-11-30", 3), "2027-02-28");
  assert.equal(B.addMonths("2026-04-01", 12), "2027-04-01");
  assert.equal(B.periodEnd("2026-12-01", 1), "2026-12-31");
  assert.equal(B.periodEnd("2026-01-31", 1), "2026-02-27");
  assert.equal(B.periodEnd("2026-04-01", 12), "2027-03-31");
  assert.equal(B.receiptNumber(7), "KC-00007");
  assert.equal(B.formatRupees(1500), "Rs 1,500");
});

test("a payment needs a whole-rupee amount, 1 to 12 months, a known method and real dates, and works out where it ends", () => {
  const ok = (extra = {}) => B.cleanPayment({ amount: "1,500", months: "3", method: "bank", paid_on: "2026-04-02", period_from: "2026-04-01", reference: " TX 123 ", note: "  ok ", ...extra }, { today: "2026-04-10", nextFrom: "2026-05-01" });
  assert.deepEqual(ok().values, { amount: 1500, months: 3, paid_on: "2026-04-02", period_from: "2026-04-01", period_to: "2026-06-30", method: "bank", reference: "TX 123", note: "ok" });
  assert.equal(B.cleanPayment({ amount: 1500, months: 1, method: "cash" }, { today: "2026-04-10", nextFrom: "2026-05-01" }).values.period_from, "2026-05-01", "no start day: continues from the next period");
  assert.equal(B.cleanPayment({ amount: 1500, months: 1, method: "cash" }, { today: "2026-04-10", nextFrom: "2026-05-01" }).values.paid_on, "2026-04-10", "no day received: today");
  for (const bad of [{ amount: "" }, { amount: "0" }, { amount: "-5" }, { amount: "12.5" }, { amount: "abc" }, { amount: "1".repeat(10) }, { amount: 100000001 }, { months: "0" }, { months: "13" }, { months: "1.5" }, { months: "x" }, { method: "bitcoin" }, { method: undefined }, { method: "__proto__" }, { paid_on: "2026-04-11" }, { paid_on: "nope" }, { period_from: "2026-02-30" }, { reference: "x".repeat(61) }, { note: "x".repeat(301) }]) assert.ok(ok(bad).error, JSON.stringify(bad));
  for (const bad of [null, [], "x", 5]) assert.ok(B.cleanPayment(bad, { today: "2026-04-10", nextFrom: "2026-05-01" }).error);
});

test("settings, a business's price and a cancel reason are checked; blank means unset", () => {
  assert.deepEqual(B.cleanBillingSettings({ standardMonthly: "1,500", instructions: " eSewa ", issuer: " KastoChha " }).values, { standard_monthly: 1500, instructions: "eSewa", issuer: "KastoChha" });
  assert.equal(B.cleanBillingSettings({ standardMonthly: "" }).values.standard_monthly, null);
  for (const bad of [null, [], { standardMonthly: "abc" }, { standardMonthly: "1.5" }, { standardMonthly: 10000001 }, { standardMonthly: "-1" }, { instructions: "x".repeat(501) }, { issuer: "x".repeat(301) }]) assert.ok(B.cleanBillingSettings(bad).error, JSON.stringify(bad));
  assert.deepEqual(B.cleanPrice({ monthlyPrice: "2,000" }), { value: 2000 });
  assert.deepEqual(B.cleanPrice({ monthlyPrice: "" }), { value: null });
  assert.deepEqual(B.cleanPrice({ monthlyPrice: null }), { value: null });
  assert.deepEqual(B.cleanPrice({ monthlyPrice: 0 }), { value: 0 });
  for (const bad of [null, {}, [], { monthlyPrice: "abc" }, { monthlyPrice: "1.5" }, { monthlyPrice: 10000001 }]) assert.ok(B.cleanPrice(bad).error, JSON.stringify(bad));
  assert.deepEqual(B.cleanVoidReason({ reason: " Typed twice " }), { reason: "Typed twice" });
  for (const bad of [null, {}, { reason: "  " }, { reason: "x".repeat(201) }, []]) assert.ok(B.cleanVoidReason(bad).error, JSON.stringify(bad));
});

// ---------- who is paid, due or late ----------

const at = (iso) => Date.parse(`${iso}T06:00:00Z`);
const live = (to, extra = {}) => ({ period_to: to, voided_at: null, ...extra });

test("only an Active business is billed: a trial and a Free business are not, and an unknown stage says so", () => {
  const now = at("2026-02-10");
  assert.equal(B.billingStatus({ stageRow: { stage: "wip", trial_started_on: "2026-01-01", trial_ends_on: "2026-04-01" }, now }).state, "trial");
  assert.equal(B.billingStatus({ stageRow: { stage: "free", trial_started_on: "2026-01-01", trial_ends_on: "2026-04-01" }, now }).state, "free");
  assert.equal(B.billingStatus({ stageRow: { stage: "wip", trial_started_on: "2026-01-01", trial_ends_on: "2026-01-31" }, now }).state, "free", "a trial past its end is Free");
  assert.equal(B.billingStatus({ stageRow: null, now }).state, "unknown");
  assert.equal(B.billingStatus({ stageRow: { stage: "active" }, now }).state, "unknown");
});

test("an Active business owes from the later of its trial end and the day it was made Active", () => {
  const row = { ...ACTIVE };
  let s = B.billingStatus({ stageRow: row, now: at("2026-03-25") });
  assert.deepEqual([s.state, s.nextFrom, s.daysToDue], ["due_soon", "2026-04-01", 7]);
  s = B.billingStatus({ stageRow: row, now: at("2026-03-01") });
  assert.deepEqual([s.state, s.nextFrom], ["paid", "2026-04-01"], "far from due, nothing yet: not shown as late");
  s = B.billingStatus({ stageRow: row, now: at("2026-04-01") });
  assert.deepEqual([s.state, s.daysLate], ["overdue", 0], "due today");
  s = B.billingStatus({ stageRow: row, now: at("2026-04-11") });
  assert.deepEqual([s.state, s.daysLate], ["overdue", 10]);
  s = B.billingStatus({ stageRow: { ...ACTIVE, stage_changed_at: "2026-06-10T05:00:00Z" }, now: at("2026-06-12") });
  assert.deepEqual([s.nextFrom, s.daysLate], ["2026-06-10", 2], "made Active after the trial ended: owes from that day");
});

test("payments push the next period on; the newest cover counts; due soon is the last 7 days; cancelled payments do not count", () => {
  const row = ACTIVE;
  let s = B.billingStatus({ stageRow: row, payments: [live("2026-04-30")], now: at("2026-04-10") });
  assert.deepEqual([s.state, s.paidThrough, s.nextFrom], ["paid", "2026-04-30", "2026-05-01"]);
  s = B.billingStatus({ stageRow: row, payments: [live("2026-04-30")], now: at("2026-04-24") });
  assert.equal(s.state, "due_soon");
  assert.equal(s.daysToDue, 7);
  s = B.billingStatus({ stageRow: row, payments: [live("2026-04-30")], now: at("2026-04-23") });
  assert.equal(s.state, "paid");
  s = B.billingStatus({ stageRow: row, payments: [live("2026-04-30")], now: at("2026-05-01") });
  assert.deepEqual([s.state, s.daysLate], ["overdue", 0]);
  s = B.billingStatus({ stageRow: row, payments: [live("2026-04-30"), live("2026-07-31"), live("2026-05-31")], now: at("2026-06-01") });
  assert.equal(s.paidThrough, "2026-07-31");
  s = B.billingStatus({ stageRow: row, payments: [live("2026-07-31", { voided_at: "2026-05-01T00:00:00Z" }), live("2026-04-30")], now: at("2026-06-01") });
  assert.deepEqual([s.state, s.paidThrough], ["overdue", "2026-04-30"]);
});

test("the price is the business's own, else the standard, else none", () => {
  const p = (extra) => B.billingStatus({ stageRow: ACTIVE, now: at("2026-04-02"), ...extra }).price;
  assert.equal(p({ standardMonthly: 1500, monthlyPrice: 1200 }), 1200);
  assert.equal(p({ standardMonthly: 1500, monthlyPrice: null }), 1500);
  assert.equal(p({ standardMonthly: null, monthlyPrice: null }), null);
  assert.equal(p({ standardMonthly: 1500, monthlyPrice: 0 }), 0, "a free-of-charge deal is a price of 0");
});

test("the status line and the reminder say what is owed; the reminder holds no private words", () => {
  const s = B.billingStatus({ stageRow: ACTIVE, standardMonthly: 1500, now: at("2026-04-11") });
  assert.match(B.statusLine(s), /Overdue by 10 days/);
  const m = B.buildReminder({ businessName: "Himal Brew House", status: s, instructions: "eSewa 9841000000" });
  assert.match(m, /Rs 1,500/); assert.match(m, /Himal Brew House/); assert.match(m, /was due on 2026-04-01/); assert.match(m, /eSewa 9841000000/);
  assert.match(B.buildReminder({ businessName: "x", status: { ...s, state: "due_soon", nextFrom: "2026-05-01" }, instructions: "" }), /is due on 2026-05-01/);
  assert.ok(!B.buildReminder({ businessName: "x", status: { ...s, price: null }, instructions: "" }).includes("Rs"));
  assert.match(B.statusLine({ state: "overdue", daysLate: 0, nextFrom: "2026-04-01" }), /Due today/);
});

// ---------- recording a payment ----------

test("an admin records a payment; it gets the next receipt number and the right end date", async () => {
  const r = await pay(P);
  assert.equal(r.status, 200);
  assert.equal(rows().length, 1);
  assert.deepEqual([rows()[0].receipt_no, rows()[0].amount, rows()[0].period_to, rows()[0].recorded_by, rows()[0].merchant_id], [1, 1500, "2026-04-30", "user_admin", ID]);
  assert.equal(r.body.receipt_no, 1);
  seed(OTHER);
  assert.equal((await pay({ ...P, amount: "900" }, OTHER)).body.receipt_no, 2, "receipt numbers run across businesses");
});

test("with no start day, the first payment starts when the trial ended and the next continues where the last ended", async () => {
  await pay({ amount: "1500", months: "2", method: "cash", paid_on: "2026-04-02" });
  assert.deepEqual([rows()[0].period_from, rows()[0].period_to], ["2026-04-01", "2026-05-31"]);
  await pay({ amount: "1500", months: "1", method: "cash", paid_on: "2026-04-03" });
  assert.deepEqual([rows()[1].period_from, rows()[1].period_to], ["2026-06-01", "2026-06-30"]);
});

test("a payment during the trial is allowed and starts on the decision day; a Free business is refused", async () => {
  Object.assign(fake.tables.sync_merchants[0], { stage: "wip", trial_ends_on: "2999-01-01", stage_changed_at: null });
  assert.equal((await pay({ amount: "1500", months: "1", method: "cash", paid_on: "2026-02-02" })).status, 200);
  assert.equal(rows()[0].period_from, "2999-01-01");
  Object.assign(fake.tables.sync_merchants[0], { stage: "free" });
  assert.equal((await pay(P)).status, 409);
  assert.equal(rows().length, 1);
});

test("bad payments change nothing and write no log entry", async () => {
  for (const b of [{}, { ...P, amount: "x" }, { ...P, months: "99" }, { ...P, method: "x" }, { ...P, paid_on: "2999-01-01" }, [], "x"]) assert.equal((await pay(b)).status, 400, JSON.stringify(b));
  assert.equal(rows().length, 0);
  assert.equal(fake.tables.admin_audit_log.length, 0);
});

test("two people recording at the same moment get different receipt numbers", async () => {
  // The first insert is refused as a duplicate; the next attempt reads the numbers again and succeeds.
  const first = { data: null, error: { code: "23505" } };
  let attempts = 0;
  const fakeDb = { from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [{ receipt_no: 5 }], error: null }) }) }), insert: (row) => ({ select: async () => { attempts += 1; return attempts === 1 ? first : { data: [row], error: null }; } }) }) };
  const made = await B.createPayment(fakeDb, ID, { amount: 1 }, "u");
  assert.equal(attempts, 2);
  assert.equal(made.receipt_no, 6);
});

// ---------- cancelling ----------

test("a mistake is cancelled with a reason, kept, and no longer counts; a second cancel or another business's payment is refused", async () => {
  await pay(P);
  seed(OTHER);
  const id = rows()[0].id;
  assert.equal((await cancel({ paymentId: id, reason: "" })).status, 400);
  assert.equal((await cancel({ paymentId: "nope", reason: "x" })).status, 400);
  assert.equal((await cancel({ paymentId: id, reason: "x" }, OTHER)).status, 404);
  assert.equal(rows()[0].voided_at ?? null, null);
  assert.equal((await cancel({ paymentId: id, reason: "Typed twice" })).status, 200);
  assert.equal(rows().length, 1, "kept, never deleted");
  assert.ok(rows()[0].voided_at);
  assert.equal(rows()[0].void_reason, "Typed twice");
  assert.equal((await cancel({ paymentId: id, reason: "again" })).status, 404);
  assert.equal(rows()[0].void_reason, "Typed twice");
  const status = B.billingStatus({ stageRow: ACTIVE, payments: rows(), now: at("2026-05-10") });
  assert.equal(status.state, "overdue", "the cancelled payment covers nothing");
});

test("a Free business's payment can still be cancelled", async () => {
  await pay(P);
  Object.assign(fake.tables.sync_merchants[0], { stage: "free" });
  assert.equal((await cancel({ paymentId: rows()[0].id, reason: "Left" })).status, 200);
});

// ---------- price and settings ----------

test("a business's own price is saved and a blank goes back to the standard", async () => {
  assert.equal((await call(priceRoute, "PUT", { monthlyPrice: "1,200" })).status, 200);
  assert.equal(fake.tables.sync_merchants[0].monthly_price, 1200);
  assert.equal((await call(priceRoute, "PUT", { monthlyPrice: "" })).status, 200);
  assert.equal(fake.tables.sync_merchants[0].monthly_price, null);
  for (const b of [{}, { monthlyPrice: "abc" }, null]) assert.equal((await call(priceRoute, "PUT", b)).status, 400, JSON.stringify(b));
  assert.equal((await call(priceRoute, "PUT", { monthlyPrice: "5" }, "33333333-3333-4333-8333-333333333333")).status, 404);
  assert.equal((await call(priceRoute, "PUT", { monthlyPrice: "5" }, "nope")).status, 400);
});

test("the settings are saved, a missing row is created, and the audit log never holds the words", async () => {
  assert.equal((await call(settingsRoute, "PUT", { standardMonthly: "2,000", instructions: "SECRET HOW TO PAY", issuer: "SECRET ISSUER PAN" })).status, 200);
  assert.deepEqual([fake.tables.sync_billing_settings[0].standard_monthly, fake.tables.sync_billing_settings[0].instructions], [2000, "SECRET HOW TO PAY"]);
  fake.tables.sync_billing_settings.length = 0;
  assert.equal((await call(settingsRoute, "PUT", { standardMonthly: "1,000" })).status, 200);
  assert.equal(fake.tables.sync_billing_settings[0].standard_monthly, 1000);
  assert.equal((await call(settingsRoute, "PUT", { standardMonthly: "abc" })).status, 400);
  const log = JSON.stringify(fake.tables.admin_audit_log);
  assert.ok(log.includes("sync.billing.settings"));
  for (const secret of ["SECRET", "2000", "1000"]) assert.ok(!log.includes(secret), secret);
});

test("the settings read back, and unreadable ones say so instead of breaking", async () => {
  const supabase = createServerSupabase();
  assert.deepEqual(await B.readBillingSettings(supabase), { standardMonthly: 1500, instructions: "eSewa 9841000000", issuer: "", failed: false });
  fake.failReadsFrom = "sync_billing_settings";
  assert.equal((await B.readBillingSettings(supabase)).failed, true);
  fake.failReadsFrom = null;
});

// ---------- who may, and what the log holds ----------

test("only an admin reaches any billing route: signed out, ordinary users and operators are refused", async () => {
  await pay(P);
  const id = rows()[0].id;
  for (const [who, role, expected] of [[null, null, 401], ["u", "user", 403], ["op_1", "operator", 403]]) {
    as(who, role);
    assert.equal((await pay(P)).status, expected, `${who} pay`);
    assert.equal((await cancel({ paymentId: id, reason: "x" })).status, expected, `${who} cancel`);
    assert.equal((await call(priceRoute, "PUT", { monthlyPrice: "5" })).status, expected, `${who} price`);
    assert.equal((await call(settingsRoute, "PUT", { standardMonthly: "5" })).status, expected, `${who} settings`);
  }
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].voided_at ?? null, null);
  assert.equal(fake.tables.sync_merchants[0].monthly_price, null);
});

test("if the audit log cannot be written, nothing is changed", async () => {
  await pay(P);
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await pay(P)).status, 500);
  assert.equal((await cancel({ paymentId: rows()[0].id, reason: "x" })).status, 500);
  assert.equal((await call(priceRoute, "PUT", { monthlyPrice: "5" })).status, 500);
  assert.equal((await call(settingsRoute, "PUT", { standardMonthly: "5" })).status, 500);
  fake.failWritesTo = null;
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].voided_at ?? null, null);
  assert.equal(fake.tables.sync_merchants[0].monthly_price, null);
});

test("the audit log keeps who and which, never the amount, the reference, the note or the reason", async () => {
  await pay({ ...P, amount: "98765", reference: "SECRETREF", note: "SECRETNOTE" });
  await cancel({ paymentId: rows()[0].id, reason: "SECRETREASON" });
  const log = JSON.stringify(fake.tables.admin_audit_log);
  for (const action of ["sync.payments.create", "sync.payments.void"]) assert.ok(log.includes(action), action);
  for (const secret of ["98765", "SECRETREF", "SECRETNOTE", "SECRETREASON", "esewa"]) assert.ok(!log.includes(secret), secret);
});

// ---------- the overview ----------

test("the overview lists Active businesses worst first, with a reminder only for those due; cancelled and non-Active ones are left out", async () => {
  const late = "33333333-3333-4333-8333-333333333333", paid = "44444444-4444-4444-8444-444444444444", trial = "55555555-5555-4555-8555-555555555555", gone = "66666666-6666-4666-8666-666666666666";
  fake.tables.sync_merchants.length = 0;
  seed(late, { business_name: "Late Cafe", owner_whatsapp: "9779841000000" });
  seed(paid, { business_name: "Paid Cafe" });
  seed(trial, { business_name: "Trial Cafe", stage: "wip" });
  seed(gone, { business_name: "Gone Cafe", status: "cancelled" });
  fake.tables.sync_payments.push({ id: "p1", merchant_id: paid, receipt_no: 1, amount: 1500, months: 12, paid_on: "2026-04-02", period_from: "2026-04-01", period_to: "2999-03-31", voided_at: null });
  const out = await B.billingOverview(createServerSupabase(), { standardMonthly: 1500, instructions: "eSewa", now: at("2026-06-01") });
  assert.deepEqual(out.map((r) => r.name), ["Late Cafe", "Paid Cafe"]);
  assert.equal(out[0].status.state, "overdue");
  assert.ok(out[0].reminder.includes("Late Cafe") && out[0].reminder.includes("Rs 1,500"));
  assert.equal(out[1].reminder, "");
  assert.equal(out[0].whatsapp, "9779841000000");
});

// ---------- the screens and the files ----------

test("the billing pages are admin only and kept out of search; the panel and page use no browser dialogs; the migration is private", () => {
  for (const file of ["app/admin/sync/billing/page.js", "app/admin/sync/[id]/receipt/[paymentId]/page.js"]) {
    const text = read(file);
    assert.match(text, /requireRole\(ROLE\.ADMIN\)/, file);
    assert.match(text, /NOINDEX_NOFOLLOW/, file);
    assert.ok(!/\bsyncAccess\(\)/.test(text), `${file} lets an operator in`);
  }
  for (const file of ["app/admin/sync/[id]/BillingPanel.js", "app/admin/sync/billing/BillingClient.js"]) {
    const text = read(file);
    assert.ok(!text.includes("alert(") && !text.includes("confirm(") && !text.includes("<nav"), file);
  }
  assert.ok(read("app/admin/sync/[id]/page.js").includes("{billing ? ("), "the payments panel is drawn for admins only");
  assert.ok(/if \(isAdmin\) \{\s*const supabase = createServerSupabase\(\);\s*const settings = await readBillingSettings/.test(read("app/admin/sync/[id]/page.js")), "payments are read only for an admin");
  const sql = read("supabase/migrations/0039_sync_billing.sql");
  assert.ok(sql.includes("enable row level security") && sql.includes("revoke all"));
  assert.ok(!/delete/i.test(read("app/api/admin/sync/merchants/[id]/payments/route.js").replace(/on delete cascade/gi, "")), "there is no way to delete a payment");
  assert.ok(read("docs/sync/runbook.md").includes("0039_sync_billing"));
});
