"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import NavAuth from "./NavAuth";

const LINKS = [
  { href: "/trending", label: "Trending" },
  { href: "/featured", label: "Featured" },
  { href: "/battle", label: "Battle" },
  { href: "/experience", label: "Experience" }
];

// Single nav used across every page so links, mobile behaviour, and auth stay
// consistent. Primary/secondary actions can be either links (href) or buttons
// (onClick handlers, e.g. the homepage modal).
export default function SiteNav({
  shareHref = "/experience#share-review",
  shareLabel = "Share a story",
  onShare
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile menu on route change and lock body scroll while open.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    return () => document.body.classList.remove("menu-open");
  }, [open]);

  const share = onShare
    ? <button type="button" className="btn-red" onClick={onShare}>{shareLabel}</button>
    : <a className="btn-red" href={shareHref}>{shareLabel}</a>;

  // Same action mirrored inside the mobile menu sheet, so the top bar can drop
  // the button on narrow screens instead of cramming (and wrapping) it.
  const sheetShare = onShare
    ? <button type="button" className="btn-red" onClick={() => { setOpen(false); onShare(); }}>{shareLabel}</button>
    : <a className="btn-red" href={shareHref} onClick={() => setOpen(false)}>{shareLabel}</a>;

  return (
    <nav id="mainnav" className={open ? "nav-open" : ""}>
      <a href="/" className="logo" aria-label="KastoChha home">
        <img src="/kastochha-logo.svg" alt="KastoChha" />
      </a>

      <div className="nav-links" aria-label="Primary">
        {LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className={`nav-link ${pathname === link.href ? "active" : ""}`}
            aria-current={pathname === link.href ? "page" : undefined}
          >
            {link.label}
          </a>
        ))}
      </div>

      <div className="nav-actions">
        {share}
        <NavAuth />
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="nav-toggle"
          onClick={() => setOpen((s) => !s)}
        >
          <span className="hamburger" aria-hidden></span>
        </button>
      </div>

      <div className="nav-sheet" role="dialog" aria-label="Menu">
        {LINKS.map((link, index) => (
          <a
            key={link.href}
            href={link.href}
            className={`nav-sheet-link ${pathname === link.href ? "active" : ""}`}
            style={{ transitionDelay: `${0.04 * index + 0.05}s` }}
            onClick={() => setOpen(false)}
          >
            {link.label}
          </a>
        ))}
        <div className="nav-sheet-actions">
          {sheetShare}
        </div>
      </div>
    </nav>
  );
}
