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
      <SignUp path="/sign-up" signInUrl="/sign-in" appearance={clerkAppearance} />
    </AuthShell>
  );
}
