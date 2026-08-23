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
      {/* fallbackRedirectUrl only applies when no redirect_url is on the
          query string, so arriving from a specific page still returns
          there. Without it, Clerk sends everyone to the homepage. */}
      <SignIn
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
        appearance={clerkAppearance}
      />
    </AuthShell>
  );
}
