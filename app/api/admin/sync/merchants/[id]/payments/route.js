import { NextResponse } from "next/server";

import { requireRole, ROLE } from "../../../../../../../lib/auth/roles";
import { billingGate, logged } from "../../../../../../../lib/sync/billingGate";
import { BODY_LIMITS, readJsonBody } from "../../../../../../../lib/requestBody";
import { billingStatus, cleanPayment, cleanVoidReason, createPayment, listPayments, voidPayment } from "../../../../../../../lib/sync/billing";
import { stageInfo } from "../../../../../../../lib/sync/stage";
import { nepalDay } from "../../../../../../../lib/sync/time";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const FREE = "This business is on the Free plan: it is not billed, so no payment can be recorded.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Record a payment that was received: { amount, months, paid_on?, period_from?, method, reference?, note? }. Admin only. Without a
// start day, the months start where the last payment ended (or, for a business not yet paying, on the day its trial ends).
export async function POST(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  const g = await billingGate(params, authResult);
  if (g.response) return g.response;
  const info = stageInfo(g.stageRow);
  if (info.known && info.stage === "free") return NextResponse.json({ error: FREE }, { status: 409 });
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;

  const today = nepalDay(Date.now());
  let existing;
  try {
    existing = await listPayments(g.supabase, params.id);
  } catch {
    return NextResponse.json({ error: "Could not read the payments. Has migration 0039 been run?" }, { status: 500 });
  }
  const status = billingStatus({ stageRow: g.stageRow, payments: existing });
  const nextFrom = status.nextFrom || status.endsOn || today;
  const cleaned = cleanPayment(parsed.data, { today, nextFrom });
  if (cleaned.error) return NextResponse.json({ error: cleaned.error }, { status: 400 });

  const out = await logged(g, "sync.payments.create", params.id, { months: cleaned.values.months }, () => createPayment(g.supabase, params.id, cleaned.values, g.authResult.userId));
  if (out.response) return out.response;
  return NextResponse.json({ ok: true, id: out.result?.id, receipt_no: out.result?.receipt_no });
}

// Cancel a payment recorded by mistake: { paymentId, reason }. It is kept, struck out, with the reason; it no longer counts. Allowed on
// any business, even a Free one.
export async function PATCH(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  const g = await billingGate(params, authResult);
  if (g.response) return g.response;
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const paymentId = parsed.data?.paymentId;
  if (typeof paymentId !== "string" || !UUID_RE.test(paymentId)) return NextResponse.json({ error: "Choose a payment." }, { status: 400 });
  const cleaned = cleanVoidReason(parsed.data);
  if (cleaned.error) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const out = await logged(g, "sync.payments.void", params.id, { id: paymentId }, () => voidPayment(g.supabase, params.id, paymentId, cleaned.reason, new Date().toISOString()));
  if (out.response) return out.response;
  if (!out.result) return NextResponse.json({ error: "That payment was not found, or is already cancelled." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
