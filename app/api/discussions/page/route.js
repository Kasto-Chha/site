import { NextResponse } from "next/server";

import { getThreadPage } from "../../../../lib/supabase/queries";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Further pages of discussion threads, for the "Load more" button.
//
// The first page is rendered on the server so the list is in the HTML for
// crawlers and for anyone whose JavaScript fails. Pages after that come from
// here — nobody's first impression depends on them, and loading every thread
// on a site with thousands would be a slow page for no benefit.
//
// Public data: threads are listed on /discussions anyway. It goes through the
// server because RLS denies the browser key direct access to `reviews`.
// ---------------------------------------------------------------------------

// Bounded so a crafted offset cannot ask for an unreasonable slice.
const PAGE_SIZE = 30;
const MAX_OFFSET = 5000;

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const requested = Number.parseInt(params.get("offset") || "0", 10);
  const offset = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 0), MAX_OFFSET)
    : 0;

  try {
    const { rows, hasMore } = await getThreadPage({ offset, limit: PAGE_SIZE });
    return NextResponse.json({ rows, hasMore, nextOffset: offset + PAGE_SIZE });
  } catch (error) {
    console.warn("[discussions/page]", error?.message || error);
    // Never break the page over a failed "load more" — what is already on
    // screen stays, and the button can be tried again.
    return NextResponse.json({ rows: [], hasMore: false, nextOffset: offset });
  }
}
