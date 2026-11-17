// The tabs on one business's page (patch 14b). Which tabs a person sees, and which one an address asks for. Pure.
// Only tabs that have something in them are listed: more arrive with the pieces that fill them.
//   Overview    its details at a glance and what to do next for this kind of business
//   Plan        the stage and the 90-day trial, the moves between stages, and the history of them
//   KastoChha   the thread's QR codes, the owner's link and the website badge (admins)
//   Tasks       what the team has to do for this business
//   Setup       details, assignments, the business tag, delete (the editing an operator may do is the details)

export const BUSINESS_TABS = [
  { id: "overview", label: "Overview", roles: ["admin", "operator"] },
  { id: "plan", label: "Plan", roles: ["admin", "operator"] },
  { id: "kastochha", label: "KastoChha", roles: ["admin"] },
  { id: "tasks", label: "Tasks", roles: ["admin", "operator"] },
  { id: "setup", label: "Setup", roles: ["admin", "operator"] }
];

export const tabsFor = (isAdmin) => BUSINESS_TABS.filter((tab) => tab.roles.includes(isAdmin ? "admin" : "operator"));

// The tab an address asks for. Unknown, misspelled or not allowed for this person -> Overview.
export function resolveTab(value, isAdmin) {
  const wanted = String(Array.isArray(value) ? value[0] : value ?? "").toLowerCase();
  return tabsFor(isAdmin).some((tab) => tab.id === wanted) ? wanted : "overview";
}

export const tabHref = (id, tab) => `/admin/sync/${id}${tab === "overview" ? "" : `?tab=${tab}`}`;

// The Google button on the business page: the maps link, else the review link, else nothing. Only an https address is used.
export function googleLink(merchant) {
  for (const value of [merchant?.google_maps_url, merchant?.google_review_url]) {
    try {
      const url = new URL(String(value || ""));
      if (url.protocol === "https:") return url.toString();
    } catch {
      // Not an address: try the next.
    }
  }
  return "";
}
