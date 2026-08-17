import LegalPage from "../components/LegalPage";
import { TERMS } from "../../lib/legal";

const DESCRIPTION =
  "The terms you agree to when you use KastoChha — your account, your content, community rules, and the limits of AI-generated answers.";

export const metadata = {
  title: "Terms & Conditions - KastoChha",
  description: DESCRIPTION,
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "KastoChha Terms & Conditions",
    description: DESCRIPTION,
    url: "/terms",
    siteName: "KastoChha",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "KastoChha Terms & Conditions",
    description: DESCRIPTION
  }
};

export default function TermsPage() {
  return <LegalPage doc={TERMS} />;
}
