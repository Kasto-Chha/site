import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";
import { syncAccess } from "../../../../lib/sync/access";
import { isAssigned, listOperators, operatorsOfMerchant } from "../../../../lib/sync/team";
import { getMerchantById } from "../../../../lib/sync/merchants";
import { pinnedTitle } from "../../../../lib/sync/threadPage";
import GoogleNumbers from "./GoogleNumbers";
import MerchantEditorClient from "./MerchantEditorClient";
import BadgePanel from "./BadgePanel";
import QrCodesPanel from "./QrCodesPanel";
import OwnerPanel from "./OwnerPanel";
import AssignmentsPanel from "./AssignmentsPanel";
import DeletePanel from "./DeletePanel";
import StagePanel from "./StagePanel";
import { STAGE_LABELS, stageInfo, stageLine } from "../../../../lib/sync/stage";
import { readStage } from "../../../../lib/sync/stageStore";
import { googleLink, resolveTab, tabHref, tabsFor } from "../../../../lib/sync/businessTabs";
import { TASK_STATUS_LABELS, TASK_TYPE_LABELS, listTasks, nepalToday, sortTasks, isDueNow } from "../../../../lib/sync/tasks";
import { kindDisplay } from "../../../../lib/sync/businessTypes";
import { familyInfo, taskTypeLabel } from "../../../../lib/sync/families";
import { readStageHistory } from "../../../../lib/sync/stageHistory";
import { prospectOfMerchant } from "../../../../lib/sync/prospects";
import { scoreFacts } from "../../../../lib/sync/audit";
import { lastMonth, listNumbers, monthOptions } from "../../../../lib/sync/googleNumbers";
import { nepalDay } from "../../../../lib/sync/time";
import { countLabel } from "../../../../lib/sync/text";
import { describeClerkUser, getClerkUser } from "../../../../lib/auth/clerk";
import { badgeSnippet, badgeStats } from "../../../../lib/sync/badge";
import { createServerSupabase } from "../../../../lib/supabase/server";
import { listQrCodes } from "../../../../lib/sync/qr";

export const metadata = {
  title: "Business - KastoChha Admin",
  robots: NOINDEX_NOFOLLOW
};

export const dynamic = "force-dynamic";

export default async function MerchantPage({ params, searchParams }) {
  const access = await syncAccess();
  if (!access.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync">Sign in</a>
      </div>
    );
  }

  const { merchant: found, error } = await getMerchantById(params.id);
  // An operator is shown a business only if it is assigned to them. Otherwise the page is the same as for one that does not exist.
  const merchant = found && (access.isAdmin || (await isAssigned(createServerSupabase(), access.userId, found.id))) ? found : null;
  if (error || !merchant) {
    return (
      <div className="admin-page">
        <h1>{error ? "Could not load this business" : "Business not found"}</h1>
        <p>{error || "It may have been removed, or the link is wrong."}</p>
        <a className="btn-outline" href="/admin/sync/businesses">Back to businesses</a>
      </div>
    );
  }

  const tab = resolveTab(searchParams?.tab, access.isAdmin);

  // Only what the screen needs. The owner's account stays on the server.
  const shown = {
    id: merchant.id,
    slug: merchant.slug,
    topic_slug: merchant.topic_slug,
    business_name: merchant.business_name,
    area: merchant.area,
    business_kind: merchant.business_kind,
    kind_label: merchant.kind_label || "",
    thread_title: pinnedTitle(merchant),
    category: merchant.category,
    about: merchant.about || "",
    google_place_id: merchant.google_place_id || "",
    google_review_url: merchant.google_review_url || "",
    google_maps_url: merchant.google_maps_url || "",
    status: merchant.status,
    posts: merchant.posts,
    questions: merchant.questions,
    hasOwner: Boolean(merchant.owner_user_id)
  };
  // The stage. A failed read shows "no stage" with the reason, and never breaks the page.
  let stage = { known: false };
  try {
    stage = stageInfo(await readStage(createServerSupabase(), merchant.id));
  } catch {
    stage = { known: false };
  }
  const google = googleLink(shown);
  // The score when we started, from the audit this business was tagged from. Admins only; a problem reading it just hides the line.
  let audit = null;
  if (access.isAdmin && tab === "overview") {
    try {
      const prospect = await prospectOfMerchant(createServerSupabase(), merchant.id);
      const score = prospect ? scoreFacts(prospect.facts).score : null;
      if (prospect && score !== null) audit = { id: prospect.id, score };
    } catch {
      audit = null;
    }
  }

  return (
    <>
      <div className="admin-page">
        <div className="admin-header">
          <div>
            <div className="page-kicker">SYNC</div>
            <h1>{shown.business_name}, {shown.area}</h1>
            <p className="admin-sub">
              <span className={`sync-pill ${stage.stage === "wip" ? "waiting" : stage.stage === "active" ? "done" : ""}`} title={stageLine(stage)}>
                {stage.known ? STAGE_LABELS[stage.stage] : "No stage"}
              </span>{" "}
              {stage.known && stage.stage === "wip" ? `Day ${stage.day} of ${stage.total} · ` : ""}
              {kindDisplay(shown.business_kind, shown.kind_label)} · {countLabel(shown.posts, "experience", "experiences")} · {countLabel(shown.questions, "question", "questions")}{shown.hasOwner ? " · owner linked" : ""}
            </p>
          </div>
          <div className="admin-actions">
            <a className="btn-outline" href="/admin/sync/businesses">Back</a>
            <a className="btn-outline" href={`/discussions/${shown.topic_slug}`}>View thread</a>
            {google ? <a className="btn-outline" href={google} target="_blank" rel="noopener noreferrer">Open on Google</a> : null}
          </div>
        </div>
        <div className="sync-tabs" role="navigation" aria-label="Business sections">
          {tabsFor(access.isAdmin).map((item) => (
            <a key={item.id} className={`sync-tab${tab === item.id ? " on" : ""}`} href={tabHref(merchant.id, item.id)} aria-current={tab === item.id ? "page" : undefined}>
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {tab === "overview" ? <OverviewTab merchant={shown} stage={stage} audit={audit} /> : null}
      {tab === "google" ? <GoogleTab merchant={shown} stage={stage} /> : null}
      {tab === "plan" ? <PlanTab merchant={shown} stage={stage} isAdmin={access.isAdmin} /> : null}
      {tab === "tasks" ? <TasksTab merchant={shown} /> : null}
      {tab === "setup" ? <SetupTab merchant={shown} isAdmin={access.isAdmin} /> : null}
      {tab === "kastochha" && access.isAdmin ? <KastoChhaTab merchant={merchant} /> : null}
    </>
  );
}

// ---------- Google ----------

// The Google half, typed in by hand until the Google connection exists. The monthly numbers come first; the other sections arrive
// with their own patches. A Free business has no work done on its Google profile, so its form is held.
async function GoogleTab({ merchant, stage }) {
  let rows = [];
  let failed = false;
  try {
    rows = await listNumbers(createServerSupabase(), merchant.id);
  } catch (error) {
    console.error("Sync google numbers failed:", error?.message || error);
    failed = true;
  }
  const today = nepalDay(Date.now());
  const free = stage.known && stage.stage === "free";
  return (
    <div className="admin-page">
      {failed ? <div className="admin-banner" role="alert">Could not load the numbers. Has migration 0030 been run?</div> : null}
      <GoogleNumbers
        merchantId={merchant.id}
        rows={rows}
        months={monthOptions(today)}
        defaultMonth={lastMonth(today)}
        disabledReason={free ? "This business is on the Free plan: we do not work on its Google profile, so no numbers are entered. The months already typed in stay here." : ""}
      />
    </div>
  );
}

// ---------- Overview ----------

function OverviewTab({ merchant, stage, audit }) {
  const family = familyInfo(merchant.business_kind);
  return (
    <>
      <div className="admin-page">
        <div className="admin-panel">
          <h2>At a glance</h2>
          <dl className="sync-facts">
            <div><dt>Page type</dt><dd>{family.pageLabel}</dd></div>
            <div><dt>Type</dt><dd>{kindDisplay(merchant.business_kind, merchant.kind_label)}</dd></div>
            <div><dt>Area</dt><dd>{merchant.area}</dd></div>
            <div>
              <dt>Stage</dt>
              <dd>
                {stage.known ? STAGE_LABELS[stage.stage] : "No stage"}
                {stage.known && stage.stage === "wip" ? ` · day ${stage.day} of ${stage.total}` : ""}{" "}
                <a href={tabHref(merchant.id, "plan")}>Open the plan</a>
              </dd>
            </div>
            <div><dt>Thread</dt><dd>/discussions/{merchant.topic_slug}</dd></div>
            <div><dt>Hub</dt><dd>/hub/{merchant.slug}</dd></div>
            <div><dt>Owner</dt><dd>{merchant.hasOwner ? "Linked" : "Not linked yet"}</dd></div>
            <div><dt>Business tag</dt><dd>{merchant.status === "active" ? "On" : "Removed"}</dd></div>
            {audit ? <div><dt>Google profile score when we started</dt><dd>{audit.score}/100 <a href={`/admin/sync/audit/${audit.id}`}>Open the audit</a></dd></div> : null}
          </dl>
        </div>
      </div>
      <div className="admin-page">
        <div className="admin-panel">
          <h2>What to set up on this {family.pageLabel.toLowerCase()}</h2>
          <ul className="sync-steps">
            {family.steps.map((step) => <li key={step}>{step}</li>)}
          </ul>
          <p className="admin-helper">The {family.itemsWord.toLowerCase()} and the other sections of this page arrive with the Google part of Sync.</p>
        </div>
      </div>
    </>
  );
}

// ---------- Plan ----------

async function PlanTab({ merchant, stage, isAdmin }) {
  // The history is for admins. A failed read is said, never shown as "nothing happened yet".
  let history = [];
  let failed = false;
  if (isAdmin) {
    try {
      history = await readStageHistory(createServerSupabase(), merchant.id);
      const names = new Map();
      for (const id of new Set(history.map((row) => row.actorId))) {
        try {
          const user = describeClerkUser(await getClerkUser(id));
          names.set(id, user?.name || user?.email || "An admin");
        } catch {
          names.set(id, "An admin");
        }
      }
      history = history.map((row) => ({ ...row, who: names.get(row.actorId) || "An admin" }));
    } catch (error) {
      console.error("Sync stage history failed:", error?.message || error);
      failed = true;
    }
  }
  return (
    <>
      <div className="admin-page">
        <StagePanel merchantId={merchant.id} info={stage} isAdmin={isAdmin} />
      </div>
      {isAdmin ? (
        <div className="admin-page">
          <div className="admin-panel">
            <h2>History</h2>
            {failed ? <div className="admin-banner" role="alert">Could not load the history.</div> : null}
            {!failed && history.length === 0 ? <p className="admin-helper">No moves yet. The business is where it started.</p> : null}
            {history.length ? (
              <div className="admin-list">
                {history.map((row) => (
                  <div className="admin-row" key={row.id}>
                    <div>
                      <div className="admin-row-title">{row.text}</div>
                      <div className="admin-row-meta">{row.when} · {row.who}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

// ---------- Tasks ----------

async function TasksTab({ merchant }) {
  const merchantId = merchant.id;
  let tasks = [];
  let failed = false;
  try {
    tasks = sortTasks(await listTasks(createServerSupabase(), { merchantIds: [merchantId] }));
  } catch (error) {
    console.error("Sync business tasks failed:", error?.message || error);
    failed = true;
  }
  const today = nepalToday();
  return (
    <div className="admin-page">
      <div className="admin-panel">
        <h2>Tasks for this business</h2>
        {failed ? <div className="admin-banner" role="alert">Could not load the tasks.</div> : null}
        {!failed && tasks.length === 0 ? <p className="admin-helper">Nothing to do for this business right now.</p> : null}
        {tasks.length ? (
          <div className="admin-list">
            {tasks.map((task) => (
              <div className="admin-row" key={task.id}>
                <div>
                  <div className="admin-row-title">{task.title}</div>
                  <div className="admin-row-meta">
                    {taskTypeLabel(task.task_type, TASK_TYPE_LABELS, merchant.business_kind)}
                    {task.due_date ? ` · due ${task.due_date}` : ""}
                    {task.urgent ? " · urgent" : ""}
                  </div>
                </div>
                <div className="admin-row-actions">
                  <span className={`sync-pill ${task.status === "done" ? "done" : isDueNow(task, today) ? "crit" : "waiting"}`}>{TASK_STATUS_LABELS[task.status] || task.status}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <div className="admin-actions">
          <a className="btn-outline" href="/admin/sync/tasks">Add or change tasks</a>
        </div>
      </div>
    </div>
  );
}

// ---------- Setup ----------

async function SetupTab({ merchant, isAdmin }) {
  // An operator gets the details form and nothing from the admin-only panels below, which are not even read.
  if (!isAdmin) return <MerchantEditorClient merchant={merchant} operatorView hideHeader />;

  // The operators on this business, and the ones that could be added. Names are looked up now; only ids are stored.
  let assigned = [];
  let available = [];
  try {
    const supabase = createServerSupabase();
    const [onThis, everyone] = await Promise.all([operatorsOfMerchant(supabase, merchant.id), listOperators(supabase)]);
    const named = async (id) => {
      try {
        const user = describeClerkUser(await getClerkUser(id));
        return { id, name: user?.name || user?.email || "An operator" };
      } catch {
        return { id, name: "An operator" };
      }
    };
    assigned = await Promise.all(onThis.map(named));
    available = await Promise.all(everyone.map((row) => row.operator_user_id).filter((id) => !onThis.includes(id)).map(named));
  } catch (failure) {
    console.error("Sync assignments read failed:", failure?.message || failure);
  }

  return (
    <>
      <MerchantEditorClient merchant={merchant} hideHeader />
      <div className="admin-page">
        <AssignmentsPanel merchantId={merchant.id} assigned={assigned} available={available} />
      </div>
      <div className="admin-page">
        <DeletePanel merchantId={merchant.id} businessName={merchant.business_name} />
      </div>
    </>
  );
}

// ---------- KastoChha: QR codes, owner, badge ----------

async function KastoChhaTab({ merchant }) {
  // The business's QR codes, with their scan counts. A failure is shown, never hidden as "none".
  let codes = [];
  let loadError = "";
  try {
    codes = await listQrCodes(createServerSupabase(), merchant.id);
  } catch (error) {
    console.error("Sync QR list failed:", error?.message || error);
    loadError = "Could not load the QR codes.";
  }

  // How the website badge has been used. A failure is shown, never hidden as "no use".
  let badge = null;
  let badgeError = "";
  try {
    badge = await badgeStats(createServerSupabase(), merchant.id);
  } catch (error) {
    console.error("Sync badge stats failed:", error?.message || error);
    badgeError = "Could not load the badge counts.";
  }

  // Who the linked owner is, for the team to see. If their account cannot be read just now, the page still says one
  // is linked rather than saying there is none.
  let owner = null;
  if (merchant.owner_user_id) {
    try {
      owner = describeClerkUser(await getClerkUser(merchant.owner_user_id));
    } catch {
      owner = { unreadable: true };
    }
  }

  return (
    <>
      <div className="admin-page">
        <QrCodesPanel
          merchantId={merchant.id}
          canCreate={merchant.status === "active"}
          siteUrl={process.env.NEXT_PUBLIC_SITE_URL || ""}
          initialCodes={codes}
          loadError={loadError}
        />
      </div>
      <div className="admin-page">
        <OwnerPanel merchantId={merchant.id} owner={owner} active={merchant.status !== "cancelled"} />
      </div>
      <div className="admin-page">
        <BadgePanel
          snippet={badgeSnippet(process.env.NEXT_PUBLIC_SITE_URL, merchant.slug)}
          active={merchant.status === "active"}
          stats={badge}
          statsError={badgeError}
        />
      </div>
    </>
  );
}
