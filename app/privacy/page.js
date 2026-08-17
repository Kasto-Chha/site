import LegalPage from "../components/LegalPage";
import { PRIVACY } from "../../lib/legal";

const DESCRIPTION =
  "How KastoChha collects, uses, and protects the information you share — accounts, posts, votes, and assistant conversations.";

export const metadata = {
  title: "Privacy Policy - KastoChha",
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "KastoChha Privacy Policy",
    description: DESCRIPTION,
    url: "/privacy",
    siteName: "KastoChha",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "KastoChha Privacy Policy",
    description: DESCRIPTION
  }
};

export default function PrivacyPolicyPage() {
  return <LegalPage doc={PRIVACY} />;
}
