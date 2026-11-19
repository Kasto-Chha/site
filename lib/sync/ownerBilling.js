// What a business owner sees about their plan and payments (patch 14r). The owner is the account the team linked to the business,
// found on the server. They see the price, where they stand, how to pay, and the receipts of payments received: never a cancelled
// payment, the team's notes, who recorded anything, or another business's payments. Server only.

import { getOwnedBusiness } from "./owner";
import { billingStatus, listPayments, readBillingSettings, receiptNumber, statusLine } from "./billing";
import { STAGE_COLUMNS } from "./stageStore";

const fail = (message, error) => Object.assign(new Error(message), { code: error?.code });

async function readPlanRow(supabase, merchantId) {
  const { data, error } = await supabase.from("sync_merchants").select(`${STAGE_COLUMNS}, monthly_price`).eq("id", merchantId).maybeSingle();
  if (error) throw fail("The plan could not be read.", error);
  return data || null;
}

// The whole plan page for one owner and business: null when the business is not theirs.
export async function ownerPlan(supabase, userId, merchantId, { now = Date.now() } = {}) {
  const merchant = await getOwnedBusiness(supabase, userId, merchantId);
  if (!merchant) return null;
  const [row, settings, payments] = await Promise.all([readPlanRow(supabase, merchant.id), readBillingSettings(supabase), listPayments(supabase, merchant.id)]);
  const status = billingStatus({ stageRow: row, payments, standardMonthly: settings.standardMonthly, monthlyPrice: Number.isInteger(row?.monthly_price) ? row.monthly_price : null, now });
  const pay = status.state === "overdue" || status.state === "due_soon" || status.state === "trial";
  return {
    business: { id: merchant.id, name: merchant.business_name },
    state: status.state,
    line: statusLine(status),
    price: status.price,
    paidThrough: status.paidThrough || null,
    nextFrom: status.nextFrom || null,
    trialEnds: status.state === "trial" ? status.endsOn : null,
    howToPay: pay ? settings.instructions : "",
    payments: payments.filter((p) => !p.voided_at).map((p) => ({ id: p.id, number: receiptNumber(p.receipt_no), amount: p.amount, paidOn: p.paid_on, from: p.period_from, to: p.period_to, months: p.months }))
  };
}

// One receipt for its owner: null when the business is not theirs, the payment is not of this business, or it was cancelled.
export async function ownerReceipt(supabase, userId, merchantId, paymentId) {
  const merchant = await getOwnedBusiness(supabase, userId, merchantId);
  if (!merchant || typeof paymentId !== "string") return null;
  const { data, error } = await supabase.from("sync_payments").select("id, receipt_no, amount, months, paid_on, period_from, period_to, method, reference, voided_at").eq("merchant_id", merchant.id).eq("id", paymentId).maybeSingle();
  if (error) throw fail("The receipt could not be read.", error);
  if (!data || data.voided_at) return null;
  const settings = await readBillingSettings(supabase);
  return { number: receiptNumber(data.receipt_no), businessName: merchant.business_name, area: merchant.area, amount: data.amount, months: data.months, paidOn: data.paid_on, from: data.period_from, to: data.period_to, method: data.method, reference: data.reference || "", issuer: settings.issuer, voided: false, voidReason: "" };
}
