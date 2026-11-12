// The Sync sidebar's links, and which one is current for an address. Pure, so it can be tested.
//   Overview        only /admin/sync itself
//   Businesses      the list, and any one business's page (/admin/sync/<id>)
//   Tasks           the team's to-do list, with the number due today beside it
//   Feedback        the inbox of private notes, with the number of new ones beside it
//   Export          the CSV downloads
//   Team            operators and who works on which business (admins only)
//   Tag a business  /admin/sync/new
// `roles` says who sees the link: an admin sees all of them, an operator (patch 13) only Tasks and Businesses. `badge` names the
// count shown beside it: "feedback" (new private notes) or "tasks" (open tasks due today or earlier).
const BOTH = ["admin", "operator"];
export const SYNC_NAV = [
  { href: "/admin/sync", label: "Overview", match: (path) => path === "/admin/sync", roles: ["admin"] },
  { href: "/admin/sync/tasks", label: "Tasks", match: (path) => path === "/admin/sync/tasks", roles: BOTH, badge: "tasks" },
  { href: "/admin/sync/businesses", label: "Businesses", match: (path) => path === "/admin/sync/businesses" || /^\/admin\/sync\/(?!new$|businesses$|feedback$|export$|tasks$|team$)[^/]+$/.test(path), roles: BOTH },
  { href: "/admin/sync/feedback", label: "Feedback", match: (path) => path === "/admin/sync/feedback", roles: ["admin"], badge: "feedback" },
  { href: "/admin/sync/export", label: "Export", match: (path) => path === "/admin/sync/export", roles: ["admin"] },
  { href: "/admin/sync/team", label: "Team", match: (path) => path === "/admin/sync/team", roles: ["admin"] },
  { href: "/admin/sync/new", label: "Tag a business", match: (path) => path === "/admin/sync/new", roles: ["admin"] }
];

// The links a person is shown. Showing a link never grants anything: each page and route checks the role itself.
export function navFor(isAdmin) {
  return SYNC_NAV.filter((item) => item.roles.includes(isAdmin ? "admin" : "operator"));
}

// A trailing slash or a missing path never changes which link is current.
export function currentNav(path) {
  const clean = (path || "").toString().split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return SYNC_NAV.find((item) => item.match(clean))?.href ?? null;
}
