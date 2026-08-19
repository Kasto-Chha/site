import LegalPage from "../components/LegalPage";
import { LEGAL } from "../../lib/legal";

const DESCRIPTION =
  "How KastoChha collects, uses, stores, and protects your information — and the rules and responsibilities that apply when using the platform.";

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

export default function PrivacyPolicyPage() {
  return <LegalPage doc={LEGAL} />;
}
