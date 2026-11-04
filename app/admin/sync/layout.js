import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import SyncNav from "./SyncNav";
import { requireRole, ROLE } from "../../../lib/auth/roles";
import "./sync-shell.css";

// KastoChha Sync's own look, for every page under /admin/sync and nothing else: a dark sidebar, a pale
// page, IBM Plex. The fonts are loaded here, so no other page pays for them.
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--sync-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--sync-mono", display: "swap" });

export default async function SyncLayout({ children }) {
  // The sidebar is for admins. Anyone else sees the page's own plain "admin access required" message
  // and nothing about how the section is laid out.
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return children;

  return (
    <div className={`sync-shell ${sans.variable} ${mono.variable}`}>
      <aside className="sync-side">
        <div className="sync-brand">
          <b>KastoChha Sync</b>
          <span>Team dashboard</span>
        </div>
        <SyncNav />
        <div className="sync-side-foot">
          <a href="/admin">&larr; KastoChha Admin</a>
          <a href="/">View the site</a>
        </div>
      </aside>
      <main className="sync-main">{children}</main>
    </div>
  );
}
