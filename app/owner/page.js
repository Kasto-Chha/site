import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../lib/supabase/server";
import { listOwnedBusinesses } from "../../lib/sync/owner";

export const dynamic = "force-dynamic";

// The owner's front door. One business: straight to it. Several: pick one. None: say so plainly.
export default async function OwnerPage() {
  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="ow-card">
        <h1 className="ow-title">Your business</h1>
        <p>Sign in with the account the KastoChha team linked to your business.</p>
        <a className="ow-btn" href="/sign-in?redirect_url=/owner">Sign in</a>
      </div>
    );
  }
  let businesses;
  try {
    businesses = await listOwnedBusinesses(createServerSupabase(), userId);
  } catch (error) {
    console.error("Owner businesses failed:", error?.message || error);
    return <div className="ow-card"><p role="alert">Could not load your business. Please try again in a moment.</p></div>;
  }
  if (businesses.length === 1) redirect(`/owner/${businesses[0].id}`);
  if (businesses.length === 0) {
    return (
      <div className="ow-card">
        <h1 className="ow-title">No business linked yet</h1>
        <p>No business is linked to this account. If you own a business on KastoChha, ask the KastoChha team to link it to this account.</p>
      </div>
    );
  }
  return (
    <>
      <h1 className="ow-title">Your businesses</h1>
      {businesses.map((b) => (
        <a key={b.id} className="ow-card ow-card-link" href={`/owner/${b.id}`}>
          <span><strong>{b.name}</strong><br /><span className="ow-sub">{b.area}</span></span>
          <span className="ow-link">Open</span>
        </a>
      ))}
    </>
  );
}
