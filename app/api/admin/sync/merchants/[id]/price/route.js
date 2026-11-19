import { NextResponse } from "next/server";

import { requireRole, ROLE } from "../../../../../../../lib/auth/roles";
import { billingGate, logged } from "../../../../../../../lib/sync/billingGate";
import { BODY_LIMITS, readJsonBody } from "../../../../../../../lib/requestBody";
import { cleanPrice, saveMerchantPrice } from "../../../../../../../lib/sync/billing";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// The monthly price agreed with this one business: { monthlyPrice: 1500 }, or blank to use the standard price. Admin only.
export async function PUT(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  const g = await billingGate(params, authResult);
  if (g.response) return g.response;
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const cleaned = cleanPrice(parsed.data);
  if (cleaned.error) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const out = await logged(g, "sync.billing.price", params.id, { custom: cleaned.value !== null }, () => saveMerchantPrice(g.supabase, params.id, cleaned.value));
  if (out.response) return out.response;
  return NextResponse.json({ ok: true, monthlyPrice: cleaned.value });
}
