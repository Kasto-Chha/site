import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { publicPosts } from "../../../../lib/publicPosts";
import { getThreadPage } from "../../../../lib/supabase/queries";
import { getBusinessesByTopicSlugs } from "../../../../lib/sync/merchants";

export const dynamic = "force-dynamic";
// force-dynamic alone does not stop Next from reusing an earlier answer from the database in a route handler:
// a removed tag or a switched-off card kept being served the old answer (found in testing, check K3).
export const fetchCache = "force-no-store";

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

  // Who is looking, so each post can say whether it is theirs without sending anyone's account id. A failure here means
  // signed out, never an error.
  let userId = null;
  try {
    ({ userId } = await auth());
  } catch {
    userId = null;
  }

  try {
    const { rows, hasMore } = await getThreadPage({ offset, limit: PAGE_SIZE });
    // The businesses among these threads, so the list can name and mark them.
    const businesses = await getBusinessesByTopicSlugs(rows.map((row) => row.topic_slug));
    return NextResponse.json({ rows: publicPosts(rows, userId), hasMore, nextOffset: offset + PAGE_SIZE, businesses });
  } catch (error) {
    console.warn("[discussions/page]", error?.message || error);
    // Never break the page over a failed "load more" — what is already on
    // screen stays, and the button can be tried again.
    return NextResponse.json({ rows: [], hasMore: false, nextOffset: offset, businesses: {} });
  }
}
