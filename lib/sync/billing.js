// Billing, recorded by hand (patch 14q). Businesses pay outside the site; the team records each payment, and this works out who is
// paid up, due or late, and builds the receipt number and the reminder. Pure rules first, then the database calls. Money is whole
// Nepali rupees. A payment is never deleted: a mistake is voided with a reason and kept. Server only.

import { addDays, diffDays, isIsoDate, stageInfo } from "./stage";
import { nepalDay } from "./time";

export const METHODS = { cash: "Cash", bank: "Bank transfer", esewa: "eSewa", khalti: "Khalti", other: "Other" };
export const MAX_PRICE = 10000000;
export const MAX_PAYMENT = 100000000;
export const REFERENCE_MAX = 60;
export const NOTE_MAX = 300;
export const REASON_MAX = 200;
export const INSTRUCTIONS_MAX = 500;
export const ISSUER_MAX = 300;
export const SOON_DAYS = 7;

const has = (input, key) => Object.prototype.hasOwnProperty.call(input, key);
const clean = (value) => (typeof value === "string" ? value.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim() : "");
const fail = (message, error) => Object.assign(new Error(message), { code: error?.code });

// Whole rupees from what was typed: 1,500 or "1500" -> 1500; anything else null.
function rupees(value) {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.replace(/[,\s]/g, "");
  return /^\d{1,9}$/.test(text) ? Number(text) : null;
}

export const formatRupees = (n) => `Rs ${Number(n).toLocaleString("en-US")}`;
export const receiptNumber = (n) => `KC-${String(n).padStart(5, "0")}`;

// A date a number of months later, keeping the day (a 31st lands on the month's last day).
export function addMonths(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

// The last day a payment covers: starting 2026-12-01 for 1 month ends 2026-12-31.
export const periodEnd = (from, months) => addDays(addMonths(from, months), -1);

// A payment as typed -> { values } or { error }. nextFrom: where the next period would start, used when no start day is typed.
export function cleanPayment(input, { today, nextFrom }) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "The payment was not understood." };
  const amount = rupees(has(input, "amount") ? input.amount : "");
  if (amount === null || amount < 1 || amount > MAX_PAYMENT) return { error: "Type the amount received in rupees." };
  const months = Number(has(input, "months") ? input.months : NaN);
  if (!Number.isInteger(months) || months < 1 || months > 12) return { error: "Months covered must be 1 to 12." };
  const paidOn = has(input, "paid_on") && input.paid_on ? input.paid_on : today;
  if (!isIsoDate(paidOn)) return { error: "Choose the day it was received." };
  if (paidOn > today) return { error: "The day received cannot be in the future." };
  const from = has(input, "period_from") && input.period_from ? input.period_from : nextFrom;
  if (!isIsoDate(from)) return { error: "Choose the first day this payment covers." };
  const method = has(input, "method") ? input.method : undefined;
  if (typeof method !== "string" || !Object.prototype.hasOwnProperty.call(METHODS, method)) return { error: "Choose how it was paid." };
  const reference = clean(has(input, "reference") ? input.reference : "");
  if (reference.length > REFERENCE_MAX) return { error: `The reference can be at most ${REFERENCE_MAX} characters.` };
  const note = clean(has(input, "note") ? input.note : "");
  if (note.length > NOTE_MAX) return { error: `The note can be at most ${NOTE_MAX} characters.` };
  return { values: { amount, months, paid_on: paidOn, period_from: from, period_to: periodEnd(from, months), method, reference, note } };
}

export function cleanVoidReason(input) {
  const reason = clean(input && typeof input === "object" && !Array.isArray(input) ? input.reason : "");
  if (!reason) return { error: "Say why this payment is being cancelled." };
  if (reason.length > REASON_MAX) return { error: `The reason can be at most ${REASON_MAX} characters.` };
  return { reason };
}

// The settings form -> { values } or { error }. A blank price means "not set".
export function cleanBillingSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "The settings were not understood." };
  const raw = has(input, "standardMonthly") ? input.standardMonthly : "";
  const blank = raw === "" || raw === null || raw === undefined;
  const price = blank ? null : rupees(raw);
  if (!blank && (price === null || price > MAX_PRICE)) return { error: "The monthly price must be a whole number of rupees." };
  const instructions = clean(has(input, "instructions") ? input.instructions : "");
  if (instructions.length > INSTRUCTIONS_MAX) return { error: `How to pay can be at most ${INSTRUCTIONS_MAX} characters.` };
  const issuer = clean(has(input, "issuer") ? input.issuer : "");
  if (issuer.length > ISSUER_MAX) return { error: `The issuer line can be at most ${ISSUER_MAX} characters.` };
  return { values: { standard_monthly: price, instructions, issuer } };
}

// A price for one business, or null to use the standard price.
export function cleanPrice(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !has(input, "monthlyPrice")) return { error: "Type the price first." };
  const raw = input.monthlyPrice;
  if (raw === "" || raw === null) return { value: null };
  const price = rupees(raw);
  if (price === null || price > MAX_PRICE) return { error: "The price must be a whole number of rupees." };
  return { value: price };
}

// Where a business stands. Only an Active business pays: a trial is not billed, and a Free business is not billed at all.
// An Active business owes from the later of the trial's end and the day it was made Active; each payment covers whole months, and
// the next period starts the day after the last covered day. state: paid | due_soon (within 7 days) | overdue (includes due today).
export function billingStatus({ stageRow, payments = [], standardMonthly = null, monthlyPrice = null, now = Date.now() }) {
  const info = stageInfo(stageRow, now);
  const today = nepalDay(now);
  const price = Number.isInteger(monthlyPrice) ? monthlyPrice : Number.isInteger(standardMonthly) ? standardMonthly : null;
  const base = { today, price, custom: Number.isInteger(monthlyPrice) };
  if (!info.known) return { ...base, state: "unknown" };
  if (info.stage === "free") return { ...base, state: "free" };
  if (info.stage === "wip") return { ...base, state: "trial", endsOn: info.endsOn, daysLeft: info.daysLeft };
  const live = payments.filter((p) => !p.voided_at && isIsoDate(p.period_to));
  const paidThrough = live.reduce((latest, p) => (!latest || p.period_to > latest ? p.period_to : latest), null);
  const changed = typeof info.changedAt === "string" && isIsoDate(nepalDay(Date.parse(info.changedAt) || 0)) ? nepalDay(Date.parse(info.changedAt)) : null;
  const start = changed && changed > info.endsOn ? changed : info.endsOn;
  const nextFrom = paidThrough ? addDays(paidThrough, 1) : start;
  const gap = diffDays(nextFrom, today);
  if (gap >= 0) return { ...base, state: "overdue", paidThrough, nextFrom, daysLate: gap };
  return { ...base, state: -gap <= SOON_DAYS ? "due_soon" : "paid", paidThrough, nextFrom, daysToDue: -gap };
}

export function statusLine(s) {
  if (s.state === "unknown") return "No stage yet";
  if (s.state === "free") return "Free: not billed";
  if (s.state === "trial") return `Trial: no payment yet, decision on ${s.endsOn}`;
  if (s.state === "overdue") return s.daysLate === 0 ? `Due today (from ${s.nextFrom})` : `Overdue by ${s.daysLate} ${s.daysLate === 1 ? "day" : "days"} (since ${s.nextFrom})`;
  if (s.state === "due_soon") return `Due in ${s.daysToDue} ${s.daysToDue === 1 ? "day" : "days"} (${s.nextFrom})`;
  return `Paid up to ${s.paidThrough}`;
}

// The WhatsApp reminder the team sends. Words only: who, what and by when, and how to pay.
export function buildReminder({ businessName, status, instructions }) {
  const name = clean(businessName).replace(/\s+/g, " ").slice(0, 80) || "your business";
  const amount = status.price ? ` of ${formatRupees(status.price)}` : "";
  const when = status.state === "overdue" ? (status.daysLate === 0 ? "is due today" : `was due on ${status.nextFrom}`) : `is due on ${status.nextFrom}`;
  const how = instructions ? `\n\nHow to pay:\n${instructions}` : "";
  return `Namaste! This is a reminder from KastoChha: the monthly payment${amount} for ${name} ${when}.${how}\n\nPlease tell us once you have paid and we will send your receipt. Thank you!`;
}

// ---------- the database ----------

const COLUMNS = "id, merchant_id, receipt_no, amount, months, paid_on, period_from, period_to, method, reference, note, voided_at, void_reason, recorded_by, created_at";

// The settings. Never throws: unreadable settings say so and fall back to empty.
export async function readBillingSettings(supabase) {
  const { data, error } = await supabase.from("sync_billing_settings").select("standard_monthly, instructions, issuer").eq("id", 1).maybeSingle();
  if (error) return { standardMonthly: null, instructions: "", issuer: "", failed: true };
  return { standardMonthly: Number.isInteger(data?.standard_monthly) ? data.standard_monthly : null, instructions: data?.instructions || "", issuer: data?.issuer || "", failed: false };
}

export async function saveBillingSettings(supabase, values, userId, now) {
  const row = { ...values, updated_by: userId || null, updated_at: now };
  const updated = await supabase.from("sync_billing_settings").update(row).eq("id", 1).select("id");
  if (updated.error) throw fail("The settings could not be saved.", updated.error);
  if (Array.isArray(updated.data) && updated.data.length > 0) return;
  const inserted = await supabase.from("sync_billing_settings").insert({ id: 1, ...row }).select("id");
  if (inserted.error) throw fail("The settings could not be saved.", inserted.error);
}

export async function saveMerchantPrice(supabase, merchantId, price) {
  const { data, error } = await supabase.from("sync_merchants").update({ monthly_price: price }).eq("id", merchantId).select("id");
  if (error) throw fail("The price could not be saved.", error);
  return Array.isArray(data) && data.length > 0;
}

// Newest period first, then newest receipt. Includes cancelled ones: they are shown, struck out.
export async function listPayments(supabase, merchantId) {
  const { data, error } = await supabase.from("sync_payments").select(COLUMNS).eq("merchant_id", merchantId).limit(500);
  if (error) throw fail("The payments could not be read.", error);
  return (data || []).sort((a, b) => (a.period_to < b.period_to ? 1 : a.period_to > b.period_to ? -1 : b.receipt_no - a.receipt_no));
}

// Payments of many businesses at once, cancelled ones left out: for the who-owes-what list.
export async function listLivePayments(supabase, merchantIds) {
  const ids = (merchantIds || []).filter(Boolean);
  if (!ids.length) return [];
  const { data, error } = await supabase.from("sync_payments").select("id, merchant_id, period_to, voided_at").in("merchant_id", ids).limit(5000);
  if (error) throw fail("The payments could not be read.", error);
  return (data || []).filter((p) => !p.voided_at);
}

export async function getPayment(supabase, merchantId, id) {
  const { data, error } = await supabase.from("sync_payments").select(COLUMNS).eq("merchant_id", merchantId).eq("id", id).maybeSingle();
  if (error) throw fail("The payment could not be read.", error);
  return data || null;
}

// The next receipt number is one more than the highest; if two people record at once the table refuses the second, and it tries again.
export async function createPayment(supabase, merchantId, values, userId) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const top = await supabase.from("sync_payments").select("receipt_no").order("receipt_no", { ascending: false }).limit(1);
    if (top.error) throw fail("The payment could not be saved.", top.error);
    const next = (top.data?.[0]?.receipt_no || 0) + 1;
    const row = { id: globalThis.crypto.randomUUID(), merchant_id: merchantId, receipt_no: next, ...values, recorded_by: userId || null };
    const { data, error } = await supabase.from("sync_payments").insert(row).select(COLUMNS);
    if (!error) return data?.[0] || null;
    if (error.code !== "23505") throw fail("The payment could not be saved.", error);
  }
  throw fail("The payment could not be saved.", { code: "23505" });
}

// Cancel a payment, keeping it. Only one that is not already cancelled. -> the row, or null.
export async function voidPayment(supabase, merchantId, id, reason, now) {
  const { data, error } = await supabase.from("sync_payments").update({ voided_at: now, void_reason: reason }).eq("merchant_id", merchantId).eq("id", id).is("voided_at", null).select(COLUMNS);
  if (error) throw fail("The payment could not be cancelled.", error);
  return data?.[0] || null;
}

// Who owes what: every Active business, worst first. Each row carries its state, what is owed, and the reminder to send.
export async function billingOverview(supabase, { standardMonthly, instructions, now = Date.now() }) {
  const { data, error } = await supabase
    .from("sync_merchants")
    .select("id, business_name, area, monthly_price, owner_whatsapp, status, stage, trial_started_on, trial_ends_on, stage_note, stage_changed_at, stage_changed_by")
    .eq("stage", "active")
    .limit(500);
  if (error) throw fail("The businesses could not be read.", error);
  const merchants = (data || []).filter((m) => m.status !== "cancelled");
  const payments = await listLivePayments(supabase, merchants.map((m) => m.id));
  const rows = merchants.map((m) => {
    const status = billingStatus({ stageRow: m, payments: payments.filter((p) => p.merchant_id === m.id), standardMonthly, monthlyPrice: m.monthly_price, now });
    return { id: m.id, name: m.business_name, area: m.area, whatsapp: m.owner_whatsapp || "", status, line: statusLine(status), reminder: status.state === "overdue" || status.state === "due_soon" ? buildReminder({ businessName: m.business_name, status, instructions }) : "" };
  });
  const rank = { overdue: 0, due_soon: 1, paid: 2, unknown: 3 };
  rows.sort((a, b) => (rank[a.status.state] ?? 9) - (rank[b.status.state] ?? 9) || (b.status.daysLate || 0) - (a.status.daysLate || 0) || a.name.localeCompare(b.name));
  return rows;
}
