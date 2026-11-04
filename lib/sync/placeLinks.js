// The review and Maps links for a Google place, built from its place ID, so an admin can
// enter the ID once instead of pasting three things. Pure. Both links are on Google's own
// hosts and pass the same checks as a link typed by hand (see googleLink in validate.js).
//
// The shapes are Google's documented ones: a review link takes the place ID as
// `placeid`, and the Maps URL takes it as `query_place_id` (with a `query`, which Google
// uses only if it cannot find the place). Check each generated link once on a real
// business before relying on it.

const REVIEW_BASE = "https://search.google.com/local/writereview?placeid=";
const MAPS_BASE = "https://www.google.com/maps/search/?api=1&query=";

export function reviewLinkFor(placeId) {
  return placeId ? `${REVIEW_BASE}${encodeURIComponent(placeId)}` : "";
}

export function mapsLinkFor(placeId, name = "") {
  if (!placeId) return "";
  const query = encodeURIComponent((name || "Google").toString().trim().slice(0, 100) || "Google");
  return `${MAPS_BASE}${query}&query_place_id=${encodeURIComponent(placeId)}`;
}

// Whether a link is one of these generated ones for this place ID, whatever the name in it.
// Used to rebuild it (rather than keep a link that points at the old place) when the ID changes.
export function reviewLinkIsFor(link, placeId) {
  return Boolean(link && placeId && link === reviewLinkFor(placeId));
}

export function mapsLinkIsFor(link, placeId) {
  if (!link || !placeId) return false;
  return link.startsWith(MAPS_BASE) && link.endsWith(`&query_place_id=${encodeURIComponent(placeId)}`);
}
