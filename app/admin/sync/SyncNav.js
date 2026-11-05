"use client";

import { usePathname } from "next/navigation";

import { SYNC_NAV, currentNav } from "../../../lib/sync/nav";

// The sidebar's links, with the current page marked. Which page is current depends on the address,
// which only the browser side knows during a navigation, so this one piece is a client component.
export function SyncNavLinks({ path, feedbackNew = 0 }) {
  const current = currentNav(path);
  return (
    // Not a <nav> element: the site's stylesheet turns every <nav> into its fixed top bar. A div with the
    // navigation role is announced the same way and is left alone.
    <div className="sync-nav" role="navigation" aria-label="Sync">
      {SYNC_NAV.map((item) => (
        <a key={item.href} href={item.href} aria-current={item.href === current ? "page" : undefined}>
          {item.label}
          {item.badge && feedbackNew > 0 ? (
            <span className="sync-count" aria-label={`${feedbackNew} new`}>{feedbackNew > 99 ? "99+" : feedbackNew}</span>
          ) : null}
        </a>
      ))}
    </div>
  );
}

export default function SyncNav({ feedbackNew = 0 }) {
  return <SyncNavLinks path={usePathname() || ""} feedbackNew={feedbackNew} />;
}
