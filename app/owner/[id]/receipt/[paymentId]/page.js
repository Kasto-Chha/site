import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import ReceiptView from "../../../../report/ReceiptView";
import PrintButton from "../../../../report/PrintButton";
import { createServerSupabase } from "../../../../../lib/supabase/server";
import { ownerReceipt } from "../../../../../lib/sync/ownerBilling";
import "../../../../report/report.css";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One receipt, for its owner to read, print or save as a PDF. A receipt of another business, or a cancelled one, looks like nothing is there.
export default async function OwnerReceiptPage({ params }) {
  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="ow-card">
        <h1 className="ow-title">Receipt</h1>
        <a className="ow-btn" href={`/sign-in?redirect_url=/owner/${encodeURIComponent(params.id || "")}/plan`}>Sign in</a>
      </div>
    );
  }
  if (!UUID_RE.test(params.id || "") || !UUID_RE.test(params.paymentId || "")) notFound();
  let receipt;
  try {
    receipt = await ownerReceipt(createServerSupabase(), userId, params.id, params.paymentId);
  } catch (error) {
    console.error("Owner receipt failed:", error?.message || error);
    return <div className="ow-card"><p role="alert">Could not load the receipt. Please try again in a moment.</p></div>;
  }
  if (!receipt) notFound();
  return (
    <main className="rp-wrap">
      <header className="rp-bar">
        <a className="rp-btn" href={`/owner/${params.id}/plan`}>Back</a>
        <div className="rp-switch"><PrintButton /></div>
      </header>
      <ReceiptView receipt={receipt} />
    </main>
  );
}
