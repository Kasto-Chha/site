// The Sync sidebar's links, and which one is current for an address. Pure, so it can be tested.
//   Overview        only /admin/sync itself
//   Businesses      the list, and any one business's page (/admin/sync/<id>)
//   Tag a business  /admin/sync/new
export const SYNC_NAV = [
  { href: "/admin/sync", label: "Overview", match: (path) => path === "/admin/sync" },
  { href: "/admin/sync/businesses", label: "Businesses", match: (path) => path === "/admin/sync/businesses" || /^\/admin\/sync\/(?!new$|businesses$)[^/]+$/.test(path) },
  { href: "/admin/sync/new", label: "Tag a business", match: (path) => path === "/admin/sync/new" }
];

// A trailing slash or a missing path never changes which link is current.
export function currentNav(path) {
  const clean = (path || "").toString().split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return SYNC_NAV.find((item) => item.match(clean))?.href ?? null;
}
