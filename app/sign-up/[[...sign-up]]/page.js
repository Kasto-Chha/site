import { NOINDEX_NOFOLLOW } from "../../../lib/seo/indexable";
import { SignUp } from "@clerk/nextjs";

import AuthShell from "../../components/AuthShell";
import { clerkAppearance } from "../../../lib/clerkAppearance";

export const metadata = {
  title: "Join KastoChha - Nepal's Curious Community Network",
  // Auth screens: no content, and no reason to crawl onward.
  robots: NOINDEX_NOFOLLOW
};

export default function SignUpPage() {
  return (
    <AuthShell>
      {/* fallbackRedirectUrl only applies when no redirect_url is on the
          query string, so arriving from a specific page still returns
          there. Without it, Clerk sends everyone to the homepage. */}
      <SignUp
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/"
        appearance={clerkAppearance}
      />
    </AuthShell>
  );
}
