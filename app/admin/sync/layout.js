import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import SyncNav from "./SyncNav";
import { createServerSupabase } from "../../../lib/supabase/server";
import { syncAccess } from "../../../lib/sync/access";
import { scopeFor } from "../../../lib/sync/taskAccess";
import { dueTaskCount, nepalToday } from "../../../lib/sync/tasks";
import { countNewFeedback } from "../../../lib/sync/feedback";
import "./sync-shell.css";

// KastoChha Sync's own look, for every page under /admin/sync and nothing else: a dark sidebar, a pale
// page, IBM Plex. The fonts are loaded here, so no other page pays for them.
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--sync-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--sync-mono", display: "swap" });

export default async function SyncLayout({ children }) {
  // The sidebar is for the team: admins, and operators (patch 13), who see only their own links. Anyone else sees the page's
  // own plain "admin access required" message and nothing about how the section is laid out.
  const access = await syncAccess();
  if (!access.ok) return children;

  // The numbers beside Feedback (new private notes, admins only) and Tasks (due today or earlier, for an operator only
  // their own businesses'). Never worth failing a page over: no number is shown if one cannot be read.
  let feedbackNew = 0;
  let tasksDue = 0;
  const supabase = createServerSupabase();
  try {
    if (access.isAdmin) feedbackNew = (await countNewFeedback(supabase)).total;
  } catch {
    feedbackNew = 0;
  }
  try {
    const scope = await scopeFor(supabase, access);
    tasksDue = await dueTaskCount(supabase, nepalToday(), { merchantIds: scope });
  } catch {
    tasksDue = 0;
  }

  return (
    <div className={`sync-shell ${sans.variable} ${mono.variable}`}>
      <aside className="sync-side">
        <div className="sync-brand">
          <b>KastoChha Sync</b>
          <span>Team dashboard</span>
        </div>
        <SyncNav feedbackNew={feedbackNew} tasksDue={tasksDue} isAdmin={access.isAdmin} />
        <div className="sync-side-foot">
          <a href="/admin">&larr; KastoChha Admin</a>
          <a href="/">View the site</a>
        </div>
      </aside>
      <main className="sync-main">{children}</main>
    </div>
  );
}
