import { kindDisplay } from "./businessTypes";
import { merchantTitle } from "./slug";
import { safeGoogleLink } from "./threadPage";

// What the hub page shows for a business, as plain functions so it can be tested without
// rendering. Pure.

export function hubFacts(merchant) {
  return {
    name: merchant.business_name,
    area: merchant.area,
    kindName: kindDisplay(merchant.business_kind, merchant.kind_label),
    title: merchantTitle(merchant)
  };
}

// The options a customer is offered, in the order the design gives them, each carrying the
// event it reports when tapped. An option appears only when it can really be done: the Google
// ones need a link that is Google's. Every option that is shown is shown the same size:
// the hub must not steer anyone toward or away from a Google review.
export function hubActions(merchant) {
  const reviewUrl = safeGoogleLink(merchant.google_review_url);
  const mapsUrl = safeGoogleLink(merchant.google_maps_url);
  const actions = [];
  // In the design's order. Share and Ask go to the business's own page, at their boxes.
  actions.push({
    key: "share",
    title: "Share your experience",
    hint: "On KastoChha, so others can read it",
    href: `/discussions/${merchant.topic_slug}#share`,
    external: false,
    event: "hub_share"
  });
  if (reviewUrl) {
    actions.push({ key: "google", title: "Review on Google", hint: "Opens the Google review box", href: reviewUrl, external: true, event: "hub_google" });
  }
  actions.push({
    key: "ask",
    title: "Ask a question",
    hint: "The community answers, on KastoChha",
    href: `/discussions/${merchant.topic_slug}#ask`,
    external: false,
    event: "hub_ask"
  });
  // A note that only the business's team ever reads: its own page, no login.
  actions.push({
    key: "note",
    title: "Send a private note",
    hint: "Only the business sees it, never posted",
    href: `/hub/${merchant.slug}/note`,
    external: false,
    event: "hub_note"
  });
  if (mapsUrl) {
    actions.push({ key: "maps", title: "Find us on Google Maps", hint: "Directions and opening details", href: mapsUrl, external: true, event: "hub_maps" });
  }
  return actions;
}
