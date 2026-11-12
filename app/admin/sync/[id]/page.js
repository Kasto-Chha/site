import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";
import { syncAccess } from "../../../../lib/sync/access";
import { isAssigned, listOperators, operatorsOfMerchant } from "../../../../lib/sync/team";
import { getMerchantById } from "../../../../lib/sync/merchants";
import { pinnedTitle } from "../../../../lib/sync/threadPage";
import MerchantEditorClient from "./MerchantEditorClient";
import BadgePanel from "./BadgePanel";
import QrCodesPanel from "./QrCodesPanel";
import OwnerPanel from "./OwnerPanel";
import AssignmentsPanel from "./AssignmentsPanel";
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
  const access = await syncAccess();
  if (!access.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync">Sign in</a>
      </div>
    );
  }

  const { merchant: found, error } = await getMerchantById(params.id);
  // An operator is shown a business only if it is assigned to them. Otherwise the page is the same as for one that does not exist.
  const merchant = found && (access.isAdmin || (await isAssigned(createServerSupabase(), access.userId, found.id))) ? found : null;
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
  // An operator gets the details form and their way to the tasks, and nothing from the admin-only panels below, which are not even read.
  if (!access.isAdmin) {
    return (
      <>
        <MerchantEditorClient merchant={shown} operatorView />
        <div className="admin-page">
          <a className="btn-outline" href="/admin/sync/tasks">Tasks</a>
        </div>
      </>
    );
  }

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

  // The operators on this business, and the ones that could be added. Names are looked up now; only ids are stored.
  let assigned = [];
  let available = [];
  try {
    const supabase = createServerSupabase();
    const [onThis, everyone] = await Promise.all([operatorsOfMerchant(supabase, merchant.id), listOperators(supabase)]);
    const named = async (id) => {
      try {
        const user = describeClerkUser(await getClerkUser(id));
        return { id, name: user?.name || user?.email || "An operator" };
      } catch {
        return { id, name: "An operator" };
      }
    };
    assigned = await Promise.all(onThis.map(named));
    available = await Promise.all(everyone.map((row) => row.operator_user_id).filter((id) => !onThis.includes(id)).map(named));
  } catch (failure) {
    console.error("Sync assignments read failed:", failure?.message || failure);
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
        <AssignmentsPanel merchantId={merchant.id} assigned={assigned} available={available} />
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
