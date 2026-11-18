import { NOINDEX_NOFOLLOW } from "../../lib/seo/indexable";
import "./owner.css";

// The owner dashboard (patch 14m): private to the signed-in owner and kept out of search engines.
export const metadata = { title: "Your business - KastoChha", robots: NOINDEX_NOFOLLOW };

export default function OwnerLayout({ children }) {
  return <div className="ow-wrap">{children}</div>;
}
