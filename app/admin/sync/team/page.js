import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";
import { describeClerkUser, getClerkUser } from "../../../../lib/auth/clerk";
import { normalizeRole, requireRole, ROLE } from "../../../../lib/auth/roles";
import { createServerSupabase } from "../../../../lib/supabase/server";
import { listAssignments, listOperators } from "../../../../lib/sync/team";
import { actionText } from "../../../../lib/sync/teamText";
import TeamClient from "./TeamClient";

export const metadata = { title: "Sync team - KastoChha Admin", robots: NOINDEX_NOFOLLOW };
export const dynamic = "force-dynamic";

// Names are looked up when the page is viewed, so the audit log and the tables keep only account ids.
async function person(cache, id) {
  if (cache.has(id)) return cache.get(id);
  let found = { name: "", email: "", role: ROLE.USER, lastActive: null, readable: false };
  try {
    const user = await getClerkUser(id);
    const described = describeClerkUser(user);
    found = { name: described?.name || "", email: described?.email || "", role: normalizeRole(user?.publicMetadata?.role), lastActive: user?.lastActiveAt ? new Date(user.lastActiveAt).toISOString() : null, readable: true };
  } catch {
    // The account could not be read just now: it is still listed, by its place in the list.
  }
  cache.set(id, found);
  return found;
}

export default async function TeamPage() {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync/team">Sign in</a>
      </div>
    );
  }

  const supabase = createServerSupabase();
  const cache = new Map();
  let operators = [];
  let merchants = [];
  let actions = [];
  let error = "";
  try {
    const [rows, assignments, found, log] = await Promise.all([
      listOperators(supabase),
      listAssignments(supabase),
      supabase.from("sync_merchants").select("id, business_name, area").order("business_name", { ascending: true }).limit(500),
      supabase.from("admin_audit_log").select("actor_id, action, target_type, target_id, created_at, status").order("created_at", { ascending: false }).limit(20)
    ]);
    if (found.error) throw found.error;
    merchants = (found.data || []).map((m) => ({ id: m.id, label: `${m.business_name}, ${m.area}` }));
    const label = Object.fromEntries(merchants.map((m) => [m.id, m.label]));
    for (const row of rows) {
      const info = await person(cache, row.operator_user_id);
      operators.push({
        id: row.operator_user_id,
        name: info.name || info.email || "An operator",
        email: info.email,
        stillOperator: !info.readable || info.role === ROLE.OPERATOR,
        lastActive: info.lastActive,
        businesses: assignments.filter((a) => a.operator_user_id === row.operator_user_id).map((a) => ({ id: a.merchant_id, label: label[a.merchant_id] || "A business" }))
      });
    }
    if (!log.error) {
      for (const entry of log.data || []) {
        const who = await person(cache, entry.actor_id);
        actions.push({ when: entry.created_at, who: who.name || who.email || "A team member", text: actionText(entry), applied: entry.status !== "failed" });
      }
    }
  } catch (failure) {
    console.error("Sync team page failed:", failure?.message || failure);
    error = "Could not load the team. Has the Sync migration 0025 been run?";
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <div className="page-kicker">SYNC</div>
          <h1>Team</h1>
          <p className="admin-sub">Operators work on the businesses you give them, and cannot change anything else. Other admin accounts are managed on the Roles page.</p>
        </div>
      </div>
      {error ? <div className="admin-banner" role="alert">{error}</div> : null}
      <TeamClient operators={operators} merchants={merchants} actions={actions} />
    </div>
  );
}
