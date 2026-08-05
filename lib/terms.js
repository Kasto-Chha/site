// Consent bookkeeping, shared by the client gate and the API route so the two
// can never disagree about what "accepted" means.

// Bump this when the terms change materially — everyone is asked again on
// their next visit, and the old acceptance stays on record with its own
// version stamp.
export const TERMS_VERSION = "2026-08-05";

// The documents the checkbox covers. Keep every consent link in this one place.
//
// NOTE: /terms and /privacy do not exist yet — the footer still has them as
// "#" placeholders. Add those pages (or repoint these two entries) before this
// gate goes live; a consent screen whose links 404 is not consent.
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
