import { NOINDEX_NOFOLLOW } from "../../../lib/seo/indexable";
import { SignIn } from "@clerk/nextjs";

import AuthShell from "../../components/AuthShell";
import { clerkAppearance } from "../../../lib/clerkAppearance";

export const metadata = {
  title: "Sign in - KastoChha",
  // Auth screens: no content, and no reason to crawl onward.
  robots: NOINDEX_NOFOLLOW
};

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn path="/sign-in" signUpUrl="/sign-up" appearance={clerkAppearance} />
    </AuthShell>
  );
}
