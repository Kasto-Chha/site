import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "../../../../lib/supabase/server";
import { filterNotes, getOwnedBusiness, listOwnerNotes, noteCounts, parseNoteFilter } from "../../../../lib/sync/owner";
import { noteAge } from "../../../../lib/sync/feedback";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The private notes customers sent to this business that the KastoChha team has read and passed on. Read only.
export default async function OwnerInboxPage({ params, searchParams }) {
  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="ow-card">
        <h1 className="ow-title">Inbox</h1>
        <a className="ow-btn" href={`/sign-in?redirect_url=/owner/${encodeURIComponent(params.id || "")}/inbox`}>Sign in</a>
      </div>
    );
  }
  if (!UUID_RE.test(params.id || "")) notFound();
  let business;
  let notes;
  try {
    const supabase = createServerSupabase();
    business = await getOwnedBusiness(supabase, userId, params.id);
    notes = business ? await listOwnerNotes(supabase, business.id) : [];
  } catch (error) {
    console.error("Owner inbox failed:", error?.message || error);
    return <div className="ow-card"><p role="alert">Could not load your inbox. Please try again in a moment.</p></div>;
  }
  if (!business) notFound();
  const filter = parseNoteFilter(searchParams?.filter);
  const counts = noteCounts(notes);
  const shown = filterNotes(notes, filter);
  const href = (f) => `/owner/${business.id}/inbox${f === "all" ? "" : `?filter=${f}`}`;
  return (
    <>
      <div className="ow-top"><a className="ow-link" href={`/owner/${business.id}`}>Back</a></div>
      <h1 className="ow-title">Inbox</h1>
      <p className="ow-sub">Private notes from your customers for {business.business_name}. Only you and the KastoChha team can read them. They are never posted. Our team reads each one first and passes it on to you.</p>
      <div className="ow-chips">
        {[["all", `All · ${counts.all}`], ["urgent", `Urgent · ${counts.urgent}`], ["done", `Done · ${counts.done}`]].map(([f, label]) => (
          <a key={f} className={`ow-chip${f === filter ? " on" : ""}`} href={href(f)}>{label}</a>
        ))}
      </div>
      {shown.length === 0 ? <div className="ow-card"><p className="ow-sub">{counts.all === 0 ? "No notes yet. When a customer sends a private note and our team has read it, it appears here." : "No notes here."}</p></div> : null}
      {shown.map((note) => (
        <div className={`ow-note${note.urgent ? " urgent" : ""}${note.done ? " done" : ""}`} key={note.id}>
          <div className="ow-note-head">
            <span className={note.urgent ? "ow-urgent" : ""}>{note.urgent ? "URGENT · " : ""}{noteAge(note.created_at)}</span>
            <span>{note.done ? "Done" : "Passed on by our team"}</span>
          </div>
          <p className="ow-text">{note.message}</p>
          <div className="ow-contact">{note.contact ? <>Customer left: <strong>{note.contact}</strong></> : "No contact left"}</div>
        </div>
      ))}
      <p className="ow-fine">This is read only for now: if a customer left a way to reach them, you can follow up yourself. Notes our team has not read yet do not appear here.</p>
    </>
  );
}
