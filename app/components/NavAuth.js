"use client";

import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { useState, useEffect } from "react";

export default function NavAuth() {
  const { user } = useUser();
  const role = (user?.publicMetadata?.role || "user").toString();
  const isAdmin = role === "admin" || role === "super_admin";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const nav = document.querySelector('#mainnav');
    if (!nav) return;
    if (open) nav.classList.add('nav-open'); else nav.classList.remove('nav-open');
  }, [open]);

  return (
    <div className="nav-auth">
        <button
          aria-label="Toggle menu"
          className="nav-toggle"
          onClick={() => setOpen((s) => !s)}
        >
          <span className="hamburger" aria-hidden></span>
        </button>
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className="btn-outline">Sign in</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        {isAdmin ? (
          <a className="btn-outline" href="/admin">Admin</a>
        ) : null}
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </div>
  );
}
