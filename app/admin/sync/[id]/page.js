import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";
import { syncAccess } from "../../../../lib/sync/access";
import { isAssigned, listOperators, operatorsOfMerchant } from "../../../../lib/sync/team";
import { getMerchantById } from "../../../../lib/sync/merchants";
import { pinnedTitle } from "../../../../lib/sync/threadPage";
import GoogleNumbers from "./GoogleNumbers";
import HealthPanel from "./HealthPanel";
import PostsPanel from "./PostsPanel";
import RepliesPanel from "./RepliesPanel";
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
import { listReplies } from "../../../../lib/sync/replies";
import { STATUS_LABELS as POST_STATUS_LABELS, listPosts } from "../../../../lib/sync/posts";
import { evaluate, listChecks } from "../../../../lib/sync/health";
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
      {tab === "google" ? <GoogleTab merchant={shown} stage={stage} isAdmin={access.isAdmin} view={["health", "posts", "replies"].includes(searchParams?.view) ? searchParams.view : "overview"} /> : null}
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
async function GoogleTab({ merchant, stage, isAdmin, view }) {
  const supabase = createServerSupabase();
  const today = nepalDay(Date.now());
  const free = stage.known && stage.stage === "free";
  const freeNote = "This business is on the Free plan: we do not work on its Google profile, so nothing is entered. What was typed in before stays here.";
  const googleHref = tabHref(merchant.id, "google");

  let checks = [];
  let healthFailed = false;
  try {
    checks = await listChecks(supabase, merchant.id);
  } catch (error) {
    console.error("Sync health failed:", error?.message || error);
    healthFailed = true;
  }
  const latest = checks[0] || null;
  const result = evaluate(latest?.facts);

  if (view === "replies") {
    let replies = [];
    let repliesFailed = false;
    try {
      replies = await listReplies(supabase, merchant.id);
    } catch (error) {
      console.error("Sync replies failed:", error?.message || error);
      repliesFailed = true;
    }
    return (
      <div className="admin-page">
        <div className="admin-actions"><a className="btn-outline" href={googleHref}>Back to Google</a></div>
        {repliesFailed ? <div className="admin-banner" role="alert">Could not load the replies. Has migration 0033 been run?</div> : null}
        <RepliesPanel merchantId={merchant.id} replies={replies} disabledReason={free ? freeNote : ""} />
      </div>
    );
  }

  if (view === "posts") {
    let posts = [];
    let postsFailed = false;
    try {
      posts = await listPosts(supabase, merchant.id);
    } catch (error) {
      console.error("Sync posts failed:", error?.message || error);
      postsFailed = true;
    }
    return (
      <div className="admin-page">
        <div className="admin-actions"><a className="btn-outline" href={googleHref}>Back to Google</a></div>
        {postsFailed ? <div className="admin-banner" role="alert">Could not load the posts. Has migration 0032 been run?</div> : null}
        <PostsPanel merchantId={merchant.id} posts={posts} disabledReason={free ? freeNote : ""} />
      </div>
    );
  }

  if (view === "health") {
    // The free audit score is on another scale (13 weighted checks), so it is shown beside the history, never in it.
    let auditLine = "";
    if (isAdmin) {
      try {
        const prospect = await prospectOfMerchant(supabase, merchant.id);
        const score = prospect ? scoreFacts(prospect.facts).score : null;
        if (score !== null && score !== undefined) auditLine = `The free audit scored ${score}/100 on its own 13 weighted checks. That is a different scale, so it is not compared with this score.`;
      } catch {
        auditLine = "";
      }
    }
    return (
      <div className="admin-page">
        <div className="admin-actions"><a className="btn-outline" href={googleHref}>Back to Google</a></div>
        {healthFailed ? <div className="admin-banner" role="alert">Could not load the checks. Has migration 0031 been run?</div> : null}
        <HealthPanel
          merchantId={merchant.id}
          evaluation={{ score: result.score, passing: result.passing, failing: result.failing, unknown: result.unknown, known: result.known, results: result.results.map((r) => ({ key: r.key, state: r.state })), groups: result.groups.map((g) => ({ key: g.key, label: g.label, passing: g.passing, total: g.total, checks: g.checks.map((c) => ({ key: c.key, label: c.label, state: c.state, fix: c.fix })) })) }}
          facts={latest?.facts || {}}
          history={checks.map((c) => ({ id: c.id, checked_on: c.checked_on, passing: c.passing, failing: c.failing, unknown: c.unknown, score: c.score }))}
          disabledReason={free ? freeNote : ""}
          auditLine={auditLine}
        />
      </div>
    );
  }

  let rows = [];
  let failed = false;
  try {
    rows = await listNumbers(supabase, merchant.id);
  } catch (error) {
    console.error("Sync google numbers failed:", error?.message || error);
    failed = true;
  }
  let postRows = [];
  let postsFailedSummary = false;
  try {
    postRows = await listPosts(supabase, merchant.id);
  } catch (error) {
    console.error("Sync posts failed:", error?.message || error);
    postsFailedSummary = true;
  }
  let replyRows = [];
  let repliesFailedSummary = false;
  try {
    replyRows = await listReplies(supabase, merchant.id);
  } catch (error) {
    console.error("Sync replies failed:", error?.message || error);
    repliesFailedSummary = true;
  }
  const unanswered = replyRows.filter((r) => r.status !== "posted");
  const oldestReply = unanswered.find((r) => r.review_on);
  const postCounts = Object.keys(POST_STATUS_LABELS).map((key) => [key, postRows.filter((p) => p.status === key).length]).filter(([, n]) => n > 0);
  const nextPost = postRows.find((p) => p.status !== "published" && p.planned_on);
  return (
    <div className="admin-page">
      <div className="admin-panel">
        <h2>Replies</h2>
        {repliesFailedSummary ? <div className="admin-banner" role="alert">Could not load the replies. Has migration 0033 been run?</div> : null}
        {replyRows.length === 0 ? <p>No reviews waiting for an answer.</p> : <p>{unanswered.length === 0 ? "Every review has a reply." : `${unanswered.length} ${unanswered.length === 1 ? "review" : "reviews"} to answer${oldestReply ? ` · oldest is from ${oldestReply.review_on}` : ""}`}{replyRows.some((r) => r.status === "asking") ? ` · ${replyRows.filter((r) => r.status === "asking").length} asking the owner` : ""}{replyRows.some((r) => r.status === "waiting") ? ` · ${replyRows.filter((r) => r.status === "waiting").length} waiting for the owner` : ""}</p>}
        <div className="admin-actions"><a className="btn-red" href={`${googleHref}${googleHref.includes("?") ? "&" : "?"}view=replies`}>{replyRows.length ? "Open replies" : "Add a review"}</a></div>
      </div>
      <div className="admin-panel">
        <h2>Posts</h2>
        {postsFailedSummary ? <div className="admin-banner" role="alert">Could not load the posts. Has migration 0032 been run?</div> : null}
        {postRows.length === 0 ? <p>No posts planned yet.</p> : <p>{postCounts.map(([key, n]) => `${n} ${POST_STATUS_LABELS[key].toLowerCase()}`).join(" · ")}{nextPost ? ` · next planned ${nextPost.planned_on}: ${nextPost.title}` : ""}</p>}
        <div className="admin-actions"><a className="btn-red" href={`${googleHref}${googleHref.includes("?") ? "&" : "?"}view=posts`}>{postRows.length ? "Open posts" : "Plan a post"}</a></div>
      </div>
      <div className="admin-panel">
        <h2>Profile health</h2>
        <p className="admin-helper">22 checks of what the public sees on Google. Typed in until the Google connection is approved.</p>
        {healthFailed ? <div className="admin-banner" role="alert">Could not load the checks. Has migration 0031 been run?</div> : null}
        {!latest ? (
          <p>No check has been typed in yet.</p>
        ) : (
          <>
            <p><strong>{result.score === null ? "No score" : `${result.score}/100`}</strong> · {result.passing} of {result.known} checked pass · checked {latest.checked_on}</p>
            <ul className="sync-steps">
              {result.groups.map((group) => (
                <li key={group.key}>{group.label}: {group.passing} of {group.total} passing{group.checks.some((c) => c.state === "fix") ? ` · to fix: ${group.checks.filter((c) => c.state === "fix").map((c) => c.label).join("; ")}` : ""}</li>
              ))}
            </ul>
            {checks.length > 1 ? <p className="admin-helper">History: {checks.slice().reverse().map((c) => `${c.checked_on} ${c.score === null ? "-" : c.score}`).join(" → ")}</p> : null}
          </>
        )}
        <div className="admin-actions"><a className="btn-red" href={`${googleHref}${googleHref.includes("?") ? "&" : "?"}view=health`}>{latest ? "Open profile health" : "Check the profile"}</a></div>
      </div>
      {failed ? <div className="admin-banner" role="alert">Could not load the numbers. Has migration 0030 been run?</div> : null}
      <GoogleNumbers
        merchantId={merchant.id}
        rows={rows}
        months={monthOptions(today)}
        defaultMonth={lastMonth(today)}
        disabledReason={free ? freeNote : ""}
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
