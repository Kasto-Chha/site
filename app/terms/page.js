import LegalPage from "../components/LegalPage";
import { LEGAL } from "../../lib/legal";

// Privacy and terms are one combined document (see lib/legal.js), so this route
// serves the same page. It exists because the footer and the sign-up consent
// gate both link to /terms by name — a "Terms" link that 404s is worse than one
// that lands on the document actually governing the platform.
//
// Canonical points at /privacy so search engines treat the pair as one page
// rather than as duplicated content.
const DESCRIPTION =
  "The terms you agree to when you use KastoChha — your account, your content, community rules, AI-generated answers, and how your data is handled.";

export const metadata = {
  title: "Privacy & Terms - KastoChha",
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "KastoChha Privacy & Terms",
    description: DESCRIPTION,
    url: "/privacy",
    siteName: "KastoChha",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "KastoChha Privacy & Terms",
    description: DESCRIPTION
  }
};

export default function TermsPage() {
  return <LegalPage doc={LEGAL} />;
}
