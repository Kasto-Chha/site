"use client";

import { usePathname } from "next/navigation";

import { currentNav, navFor } from "../../../lib/sync/nav";

// The sidebar's links, with the current page marked. Which page is current depends on the address,
// which only the browser side knows during a navigation, so this one piece is a client component.
export function SyncNavLinks({ path, feedbackNew = 0, tasksDue = 0, isAdmin = true }) {
  const current = currentNav(path);
  const counts = { feedback: feedbackNew, tasks: tasksDue };
  return (
    // Not a <nav> element: the site's stylesheet turns every <nav> into its fixed top bar. A div with the
    // navigation role is announced the same way and is left alone.
    <div className="sync-nav" role="navigation" aria-label="Sync">
      {navFor(isAdmin).map((item) => (
        <a key={item.href} href={item.href} aria-current={item.href === current ? "page" : undefined}>
          {item.label}
          {item.badge && counts[item.badge] > 0 ? (
            <span className="sync-count" aria-label={`${counts[item.badge]} ${item.badge === "tasks" ? "due" : "new"}`}>{counts[item.badge] > 99 ? "99+" : counts[item.badge]}</span>
          ) : null}
        </a>
      ))}
    </div>
  );
}

export default function SyncNav({ feedbackNew = 0, tasksDue = 0, isAdmin = true }) {
  return <SyncNavLinks path={usePathname() || ""} feedbackNew={feedbackNew} tasksDue={tasksDue} isAdmin={isAdmin} />;
}
