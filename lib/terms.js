// Consent bookkeeping, shared by the client gate and the API route so the two
// can never disagree about what "accepted" means.

// Bump this when the terms change materially — everyone is asked again on
// their next visit, and the old acceptance stays on record with its own
// version stamp.
export const TERMS_VERSION = "2026-08-05";

// The documents the checkbox covers. Keep every consent link in this one place.
// All three routes exist; their copy lives in lib/legal.js (privacy, terms) and
// app/guidelines/page.js.
export const LEGAL_LINKS = {
  terms: "/terms",
  privacy: "/privacy",
  guidelines: "/guidelines"
};

// True only when the user accepted the CURRENT version.
export function hasAcceptedTerms(publicMetadata) {
  if (!publicMetadata?.termsAcceptedAt) return false;
  return publicMetadata.termsVersion === TERMS_VERSION;
}
