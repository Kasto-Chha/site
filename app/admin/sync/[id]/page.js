import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";
import { requireRole, ROLE } from "../../../../lib/auth/roles";
import { getMerchantById } from "../../../../lib/sync/merchants";
import { pinnedTitle } from "../../../../lib/sync/threadPage";
import MerchantEditorClient from "./MerchantEditorClient";
import BadgePanel from "./BadgePanel";
import QrCodesPanel from "./QrCodesPanel";
import OwnerPanel from "./OwnerPanel";
import { describeClerkUser, getClerkUser } from "../../../../lib/auth/clerk";
import { badgeSnippet, badgeStats } from "../../../../lib/sync/badge";
import { createServerSupabase } from "../../../../lib/supabase/server";
import { listQrCodes } from "../../../../lib/sync/qr";

export const metadata = {
  title: "Business - KastoChha Admin",
  robots: NOINDEX_NOFOLLOW
};

export const dynamic = "force-dynamic";

export default async function MerchantPage({ params }) {
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

  const { merchant, error } = await getMerchantById(params.id);
  if (error || !merchant) {
    return (
      <div className="admin-page">
        <h1>{error ? "Could not load this business" : "Business not found"}</h1>
        <p>{error || "It may have been removed, or the link is wrong."}</p>
        <a className="btn-outline" href="/admin/sync/businesses">Back to businesses</a>
      </div>
    );
  }

  // Only what the screen needs. The owner's account stays on the server.
  const shown = {
    id: merchant.id,
    slug: merchant.slug,
    topic_slug: merchant.topic_slug,
    business_name: merchant.business_name,
    area: merchant.area,
    business_kind: merchant.business_kind,
    kind_label: merchant.kind_label || "",
    thread_title: pinnedTitle(merchant),
    category: merchant.category,
    about: merchant.about || "",
    google_place_id: merchant.google_place_id || "",
    google_review_url: merchant.google_review_url || "",
    google_maps_url: merchant.google_maps_url || "",
    status: merchant.status,
    posts: merchant.posts,
    questions: merchant.questions,
    hasOwner: Boolean(merchant.owner_user_id)
  };
  // The business's QR codes, with their scan counts. A failure is shown, never hidden as "none".
  let codes = [];
  let loadError = "";
  try {
    codes = await listQrCodes(createServerSupabase(), merchant.id);
  } catch (error) {
    console.error("Sync QR list failed:", error?.message || error);
    loadError = "Could not load the QR codes.";
  }

  // How the website badge has been used. A failure is shown, never hidden as "no use".
  let badge = null;
  let badgeError = "";
  try {
    badge = await badgeStats(createServerSupabase(), merchant.id);
  } catch (error) {
    console.error("Sync badge stats failed:", error?.message || error);
    badgeError = "Could not load the badge counts.";
  }

  // Who the linked owner is, for the team to see. If their account cannot be read just now, the page still says one
  // is linked rather than saying there is none.
  let owner = null;
  if (merchant.owner_user_id) {
    try {
      owner = describeClerkUser(await getClerkUser(merchant.owner_user_id));
    } catch {
      owner = { unreadable: true };
    }
  }

  return (
    <>
      <MerchantEditorClient merchant={shown} />
      <div className="admin-page">
        <QrCodesPanel
          merchantId={merchant.id}
          canCreate={merchant.status === "active"}
          siteUrl={process.env.NEXT_PUBLIC_SITE_URL || ""}
          initialCodes={codes}
          loadError={loadError}
        />
      </div>
      <div className="admin-page">
        <OwnerPanel merchantId={merchant.id} owner={owner} active={merchant.status !== "cancelled"} />
      </div>
      <div className="admin-page">
        <BadgePanel
          snippet={badgeSnippet(process.env.NEXT_PUBLIC_SITE_URL, merchant.slug)}
          active={merchant.status === "active"}
          stats={badge}
          statsError={badgeError}
        />
      </div>
    </>
  );
}
