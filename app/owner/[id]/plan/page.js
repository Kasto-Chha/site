import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../../lib/supabase/server";
import { ownerPlan } from "../../../../lib/sync/ownerBilling";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rs = (n) => `Rs ${Number(n).toLocaleString("en-US")}`;

// The owner's plan: the price, where they stand, how to pay, and the receipts of what we have received. Read only.
export default async function OwnerPlanPage({ params }) {
  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="ow-card">
        <h1 className="ow-title">Your plan</h1>
        <a className="ow-btn" href={`/sign-in?redirect_url=/owner/${encodeURIComponent(params.id || "")}/plan`}>Sign in</a>
      </div>
    );
  }
  if (!UUID_RE.test(params.id || "")) notFound();
  let plan;
  try {
    plan = await ownerPlan(createServerSupabase(), userId, params.id);
  } catch (error) {
    console.error("Owner plan failed:", error?.message || error);
    return <div className="ow-card"><p role="alert">Could not load your plan. Please try again in a moment.</p></div>;
  }
  if (!plan) notFound();
  const late = plan.state === "overdue";
  return (
    <>
      <div className="ow-top"><a className="ow-link" href={`/owner/${plan.business.id}`}>Back</a></div>
      <h1 className="ow-title">Your plan</h1>
      <p className="ow-sub">{plan.business.name}</p>

      <div className={`ow-card${late ? " ow-notice" : ""}`}>
        <h2>{plan.state === "free" ? "Free plan" : plan.state === "trial" ? "Free trial" : plan.state === "overdue" ? "Payment due" : plan.state === "due_soon" ? "Payment coming up" : plan.state === "paid" ? "Paid up" : "Your plan"}</h2>
        {plan.state === "free" ? <p>Your business is on the Free plan, so there is nothing to pay. Your page, QR cards and badge stay on KastoChha.</p> : null}
        {plan.state === "trial" ? <p>Your free trial runs until {plan.trialEnds}. {plan.price ? `After that the price is ${rs(plan.price)} a month.` : ""}</p> : null}
        {plan.state === "unknown" ? <p>Your plan details are not set up yet. We will add them soon.</p> : null}
        {["paid", "due_soon", "overdue"].includes(plan.state) ? (
          <>
            <p>{plan.line}.</p>
            {plan.price ? <div className="ow-row"><span>Price</span><span className="ow-num">{rs(plan.price)}<span className="ow-delta">a month</span></span></div> : null}
            {plan.paidThrough ? <div className="ow-row"><span>Paid up to</span><span className="ow-num">{plan.paidThrough}</span></div> : null}
            <div className="ow-row"><span>Next period starts</span><span className="ow-num">{plan.nextFrom}</span></div>
          </>
        ) : null}
        {plan.howToPay ? <><strong>How to pay</strong><p className="ow-text">{plan.howToPay}</p><p className="ow-sub">After you pay, tell us and we will send your receipt.</p></> : null}
      </div>

      <div className="ow-card">
        <h2>Receipts</h2>
        {plan.payments.length === 0 ? <p className="ow-sub">No payments received yet.</p> : plan.payments.map((p) => (
          <a className="ow-row ow-card-link" key={p.id} href={`/owner/${plan.business.id}/receipt/${p.id}`}>
            <span>{p.number}<span className="ow-delta">{p.from} to {p.to}</span></span>
            <span className="ow-num">{rs(p.amount)}<span className="ow-delta">received {p.paidOn}</span></span>
          </a>
        ))}
      </div>
      <p className="ow-fine">Receipts show payments we have received. They are not tax invoices.</p>
    </>
  );
}
