// The Sync sidebar's links, and which one is current for an address. Pure, so it can be tested.
//   Overview        only /admin/sync itself
//   Businesses      the list, and any one business's page (/admin/sync/<id>)
//   Feedback        the inbox of private notes, with the number of new ones beside it
//   Export          the CSV downloads
//   Tag a business  /admin/sync/new
export const SYNC_NAV = [
  { href: "/admin/sync", label: "Overview", match: (path) => path === "/admin/sync" },
  { href: "/admin/sync/businesses", label: "Businesses", match: (path) => path === "/admin/sync/businesses" || /^\/admin\/sync\/(?!new$|businesses$|feedback$|export$)[^/]+$/.test(path) },
  { href: "/admin/sync/feedback", label: "Feedback", match: (path) => path === "/admin/sync/feedback", badge: true },
  { href: "/admin/sync/export", label: "Export", match: (path) => path === "/admin/sync/export" },
  { href: "/admin/sync/new", label: "Tag a business", match: (path) => path === "/admin/sync/new" }
];

// A trailing slash or a missing path never changes which link is current.
export function currentNav(path) {
  const clean = (path || "").toString().split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return SYNC_NAV.find((item) => item.match(clean))?.href ?? null;
}
