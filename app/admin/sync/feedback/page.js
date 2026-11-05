import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";
import { requireRole, ROLE } from "../../../../lib/auth/roles";
import { createServerSupabase } from "../../../../lib/supabase/server";
import { buildDigest, feedbackCounts, listFeedback, noteAge, parseFilter } from "../../../../lib/sync/feedback";
import FeedbackInbox from "./FeedbackInbox";
import { FeedbackTabs } from "./FeedbackParts";

export const metadata = {
  title: "Sync feedback - KastoChha Admin",
  robots: NOINDEX_NOFOLLOW
};

export const dynamic = "force-dynamic";

// The private notes customers sent from the hubs: never shown publicly. Urgent ones come first. A person on
// the team reads every note before anything is forwarded; the "urgent" flag is only a nudge.
export default async function SyncFeedbackPage({ searchParams }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync/feedback">Sign in</a>
      </div>
    );
  }

  const filter = parseFilter(searchParams?.status);
  const now = Date.now();
  let notes = [];
  let digests = [];
  let counts = null;
  let error = "";
  try {
    const supabase = createServerSupabase();
    const [shown, waiting, tally] = await Promise.all([listFeedback(supabase, { filter }), listFeedback(supabase, { filter: "new" }), feedbackCounts(supabase)]);
    notes = shown.map((n) => ({ ...n, age: noteAge(n.created_at, now) }));
    counts = tally;

    // One digest per business that has new notes: what the team copies and sends.
    const byBusiness = new Map();
    for (const note of waiting) {
      if (!note.business) continue;
      // A business whose tag was removed can still have notes from before (new ones are refused). Its digest is
      // offered, so the team can send or clear them, and it says so.
      const name = note.business.status === "cancelled" ? `${note.business.business_name} (tag removed)` : note.business.business_name;
      if (!byBusiness.has(note.merchant_id)) byBusiness.set(note.merchant_id, { merchantId: note.merchant_id, name, notes: [] });
      byBusiness.get(note.merchant_id).notes.push(note);
    }
    digests = [...byBusiness.values()].map((d) => ({ merchantId: d.merchantId, name: d.name, count: d.notes.length, urgent: d.notes.filter((n) => n.is_urgent).length, text: buildDigest({ businessName: d.name, notes: d.notes }) }));
  } catch (loadError) {
    // Never shown as an empty inbox: "no notes" must not be what a failed read looks like.
    console.error("Sync feedback failed:", loadError?.message || loadError);
    error = "Could not load the inbox. Nothing below is shown, so it cannot be mistaken for no notes. Try again in a moment.";
  }

  return (
    <>
      <div className="ov-head">
        <div>
          <div className="page-kicker">SYNC</div>
          <h1>Feedback</h1>
          <p>Private notes from the hubs, never shown publicly. Urgent ones come first.</p>
        </div>
        {counts ? <FeedbackTabs filter={filter} counts={counts} /> : null}
      </div>
      {error ? <div className="ov-banner" role="alert">{error}</div> : null}
      {!error ? <FeedbackInbox notes={notes} digests={digests} /> : null}
    </>
  );
}
