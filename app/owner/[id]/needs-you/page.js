import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../../lib/supabase/server";
import { ownerNeeds } from "../../../../lib/sync/owner";
import NeedsYou from "./NeedsYou";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What is waiting for this owner: things to check and approve, and the team's questions. Owner-safe fields only.
export default async function OwnerNeedsPage({ params }) {
  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="ow-card">
        <h1 className="ow-title">Needs you</h1>
        <a className="ow-btn" href={`/sign-in?redirect_url=/owner/${encodeURIComponent(params.id || "")}/needs-you`}>Sign in</a>
      </div>
    );
  }
  if (!UUID_RE.test(params.id || "")) notFound();
  let needs;
  try {
    needs = await ownerNeeds(createServerSupabase(), userId, params.id);
  } catch (error) {
    console.error("Owner needs failed:", error?.message || error);
    return <div className="ow-card"><p role="alert">Could not load this page. Please try again in a moment.</p></div>;
  }
  if (!needs) notFound();
  return (
    <>
      <div className="ow-top"><a className="ow-link" href={`/owner/${needs.business.id}`}>Back</a></div>
      <h1 className="ow-title">Needs you</h1>
      <p className="ow-sub">{needs.business.name}</p>
      {needs.free ? <div className="ow-card"><p>Your business is on the Free plan, so nothing is waiting for you here.</p></div> : <NeedsYou businessId={needs.business.id} needs={needs} />}
    </>
  );
}
