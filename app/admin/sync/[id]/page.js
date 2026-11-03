import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";
import { requireRole, ROLE } from "../../../../lib/auth/roles";
import { getMerchantById } from "../../../../lib/sync/merchants";
import MerchantEditorClient from "./MerchantEditorClient";

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
        <a className="btn-outline" href="/admin/sync">Back to businesses</a>
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
  return <MerchantEditorClient merchant={shown} />;
}
