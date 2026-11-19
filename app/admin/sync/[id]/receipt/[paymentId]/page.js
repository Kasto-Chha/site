import { notFound } from "next/navigation";

import ReceiptView from "../../../../../report/ReceiptView";
import PrintButton from "../../../../../report/PrintButton";
import { NOINDEX_NOFOLLOW } from "../../../../../../lib/seo/indexable";
import { createServerSupabase } from "../../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../../lib/auth/roles";
import { getMerchantById } from "../../../../../../lib/sync/merchants";
import { getPayment, readBillingSettings, receiptNumber } from "../../../../../../lib/sync/billing";
import "../../../../../report/report.css";

export const metadata = { title: "Receipt - KastoChha Admin", robots: NOINDEX_NOFOLLOW };
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A payment receipt for the team to check and print. Admins only; a payment of another business is never shown.
export default async function ReceiptPage({ params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync">Sign in</a>
      </div>
    );
  }
  if (!UUID_RE.test(params.id || "") || !UUID_RE.test(params.paymentId || "")) notFound();
  const { merchant, error } = await getMerchantById(params.id);
  if (error) return <div className="admin-page"><div className="admin-banner" role="alert">Could not load that business.</div></div>;
  if (!merchant) notFound();
  const supabase = createServerSupabase();
  let payment;
  try {
    payment = await getPayment(supabase, merchant.id, params.paymentId);
  } catch (failure) {
    console.error("Sync receipt failed:", failure?.message || failure);
    return <div className="admin-page"><div className="admin-banner" role="alert">Could not load the payment. Has migration 0039 been run?</div></div>;
  }
  if (!payment) notFound();
  const settings = await readBillingSettings(supabase);
  return (
    <main className="rp-wrap">
      <header className="rp-bar">
        <a className="rp-btn" href={`/admin/sync/${merchant.id}?tab=plan`}>Back to Plan</a>
        <div className="rp-switch"><PrintButton /></div>
      </header>
      <ReceiptView receipt={{ number: receiptNumber(payment.receipt_no), businessName: merchant.business_name, area: merchant.area, amount: payment.amount, months: payment.months, paidOn: payment.paid_on, from: payment.period_from, to: payment.period_to, method: payment.method, reference: payment.reference, issuer: settings.issuer, voided: Boolean(payment.voided_at), voidReason: payment.void_reason || "" }} />
    </main>
  );
}
