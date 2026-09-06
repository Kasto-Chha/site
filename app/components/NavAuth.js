"use client";

import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import Link from "next/link";

// Admin stays reachable at /admin directly (server-side role gate);
// it is intentionally not linked from the nav.
export default function NavAuth() {
  const pathname = usePathname();

  // Signing out used to send everyone to the homepage. Reading a discussion and
  // signing out should leave you on that discussion, just signed out — losing
  // your place is a cost with nothing bought for it.
  //
  // Admin is the exception: staying on a screen you can no longer load means
  // staring at an error instead of a page.
  const afterSignOutUrl =
    !pathname || pathname.startsWith("/admin") ? "/" : pathname;

  return (
    <div className="nav-auth">
      <SignedOut>
        <Link href="/sign-in" className="btn-outline">Sign in</Link>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl={afterSignOutUrl} />
      </SignedIn>
    </div>
  );
}
