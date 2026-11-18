// Patch 14k: the monthly report.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const M = await import("../lib/sync/monthly.js");
const read = (file) => fs.readFileSync(file, "utf8");

const merchant = { business_name: "Himal Brew House", area: "Jhamsikhel" };
const numbers = [
  { month: "2026-10-01", calls: 128, directions: 342, profile_views: 6140, rating: 4.6, reviews: 87, note: "Good month" },
  { month: "2026-09-01", calls: 100, directions: 400, profile_views: 0, rating: 4.4, reviews: 80, note: "" }
];
const GOOD = { name: "yes", contact: "all", website: "yes", category: "yes", hours: "full", festival: "no", closures: "yes", description: "yes", extraCategories: 3, services: "yes", photos: 14, photoAgeDays: 20, logo: "yes", menuPhoto: "yes", rating: 4.6, reviews: 87, waiting: 0, replies: "fast", postDays: 5, offer: "yes", postsMonth: 5, postLink: "yes" };

test("months: the range, the one before, and bad months", () => {
  assert.deepEqual(M.monthRange("2026-10"), { start: "2026-10-01", end: "2026-11-01" });
  assert.deepEqual(M.monthRange("2026-12"), { start: "2026-12-01", end: "2027-01-01" });
  assert.equal(M.previousMonth("2026-10"), "2026-09");
  assert.equal(M.previousMonth("2026-01"), "2025-12");
  for (const bad of ["", "2026-13", "x", null, "2019-12"]) { assert.equal(M.monthRange(bad), null); assert.equal(M.buildMonthly({ merchant, month: bad }), null); }
});

test("the change against last month is shown only when both are typed in, and never a percent of zero", () => {
  assert.deepEqual(M.change(128, 100), { delta: 28, percent: 28 });
  assert.deepEqual(M.change(90, 100), { delta: -10, percent: -10 });
  assert.deepEqual(M.change(5, 0), { delta: 5, percent: null });
  assert.deepEqual(M.change(100, 100), { delta: 0, percent: 0 });
  assert.equal(M.change(null, 5), null);
  assert.equal(M.change(5, null), null);
  assert.equal(M.change(undefined, 5), null);
});

test("the numbers sit beside last month's, and a missing month says so instead of guessing", () => {
  const r = M.buildMonthly({ merchant, month: "2026-10", numbers });
  assert.equal(r.label, "October 2026");
  assert.equal(r.previousLabel, "September 2026");
  assert.equal(r.hasNumbers, true);
  assert.deepEqual(r.metrics.map((m) => [m.key, m.value, m.before, m.change?.delta]), [["calls", 128, 100, 28], ["directions", 342, 400, -58], ["views", 6140, 0, 6140]]);
  assert.equal(r.metrics[2].change.percent, null);
  assert.equal(r.reviews.change.delta, 7);
  assert.equal(r.rating.value, 4.6);
  assert.equal(r.note, "Good month");
  const none = M.buildMonthly({ merchant, month: "2026-08", numbers });
  assert.equal(none.hasNumbers, false);
  assert.ok(none.metrics.every((m) => m.value === null && m.change === null));
  const first = M.buildMonthly({ merchant, month: "2026-09", numbers });
  assert.equal(first.hasPrevious, false);
  assert.ok(first.metrics.every((m) => m.change === null));
});

test("a typed zero is a figure, not a missing one", () => {
  const r = M.buildMonthly({ merchant, month: "2026-09", numbers });
  assert.equal(r.metrics[2].value, 0);
});

test("the work counts only what was finished inside the month", () => {
  const posts = [
    { status: "published", published_on: "2026-10-05", kind: "offer" },
    { status: "published", published_on: "2026-10-31", kind: "update" },
    { status: "published", published_on: "2026-11-01", kind: "update" },
    { status: "published", published_on: "2026-09-30", kind: "event" },
    { status: "approved", published_on: null, kind: "update" },
    { status: "approved", published_on: "2026-10-15", kind: "offer" }
  ];
  const replies = [{ status: "posted", posted_on: "2026-10-12" }, { status: "posted", posted_on: "2026-09-12" }, { status: "drafted", posted_on: null }, { status: "approved", posted_on: "2026-10-20" }];
  // done_at is a moment; the Nepal day decides the month (18:15 UTC on 31 Oct is already 1 Nov in Nepal)
  // so 17:00 UTC on 31 Oct is October, 19:00 UTC is November, and 20:00 UTC on 30 Sep is already 1 Oct
  const tasks = [
    { status: "done", task_type: "photos", done_at: "2026-10-10T05:00:00Z" },
    { status: "done", task_type: "photos", done_at: "2026-10-31T17:00:00Z" },
    { status: "done", task_type: "hours", done_at: "2026-10-31T19:00:00Z" },
    { status: "open", task_type: "hours", done_at: null },
    { status: "done", task_type: "reply", done_at: "2026-09-30T20:00:00Z" }
  ];
  const r = M.buildMonthly({ merchant, month: "2026-10", numbers, posts, replies, tasks });
  assert.equal(r.work.posts.total, 2);
  assert.deepEqual(r.work.posts.byKind.map((k) => [k.label, k.n]).sort(), [["Offer", 1], ["Update", 1]]);
  assert.equal(r.work.replies, 1);
  assert.equal(r.work.tasks.total, 3);
  assert.deepEqual(r.work.tasks.byType.map((t) => [t.label, t.n]), [["Photos", 2], ["A reply", 1]]);
  const november = M.buildMonthly({ merchant, month: "2026-11", numbers, tasks });
  assert.deepEqual(november.work.tasks.byType.map((t) => [t.label, t.n]), [["Hours", 1]], "the late-evening one belongs to November in Nepal");
});

test("the profile score is the check standing at the end of the month, and the one before it shows the direction", () => {
  const checks = [
    { checked_on: "2026-11-03", created_at: "4", facts: { ...GOOD, website: "no" }, score: 95, passing: 20, failing: 1 },
    { checked_on: "2026-10-20", created_at: "3", facts: GOOD, score: 95, passing: 21, failing: 1 },
    { checked_on: "2026-10-02", created_at: "2", facts: { website: "no" }, score: 0, passing: 0, failing: 1 },
    { checked_on: "2026-09-10", created_at: "1", facts: { website: "no", category: "yes" }, score: 50, passing: 1, failing: 1 }
  ];
  const r = M.buildMonthly({ merchant, month: "2026-10", numbers, checks });
  assert.equal(r.health.checkedOn, "2026-10-20");
  assert.equal(r.health.score, 95);
  assert.equal(r.health.before, 50);
  assert.equal(M.buildMonthly({ merchant, month: "2026-10", numbers, checks: [] }).health, null);
  assert.equal(M.buildMonthly({ merchant, month: "2026-08", numbers, checks: [checks[3]] }).health, null, "no check yet by then");
  // what to look at next comes from the newest check of all
  assert.deepEqual(r.next, ["Website link set", "Festival and special hours are set"]);
  assert.ok(M.buildMonthly({ merchant, month: "2026-10", numbers, checks: [{ checked_on: "2026-10-20", created_at: "1", facts: {}, score: null, passing: 0, failing: 0 }] }).next.length === 0);
});

test("at most five things to look at next", () => {
  const checks = [{ checked_on: "2026-10-20", created_at: "1", facts: { name: "no", contact: "none", website: "no", category: "no", hours: "none", festival: "no", closures: "no" }, score: 0, passing: 0, failing: 7 }];
  assert.equal(M.buildMonthly({ merchant, month: "2026-10", numbers, checks }).next.length, 5);
});

test("the report shows no task titles, no reviewer names and no draft words, and claims no cause", () => {
  const r = M.buildMonthly({
    merchant, month: "2026-10", numbers,
    tasks: [{ status: "done", task_type: "other", done_at: "2026-10-10T05:00:00Z", title: "SECRET TASK TITLE", details: "PRIVATE DETAILS" }],
    replies: [{ status: "posted", posted_on: "2026-10-10", reviewer: "SECRET REVIEWER", review: "SECRET REVIEW", draft: "SECRET DRAFT" }],
    posts: [{ status: "published", published_on: "2026-10-10", kind: "update", title: "SECRET POST", body: "SECRET BODY" }]
  });
  assert.ok(!JSON.stringify(r).includes("SECRET") && !JSON.stringify(r).includes("PRIVATE"));
  assert.match(M.DISCLAIMER, /does not claim that one caused the other/);
  assert.match(M.DISCLAIMER, /does not promise any result/);
});

test("the page is for admins, reads the month from the address, and the view prints on one A4 page", () => {
  const page = read("app/admin/sync/[id]/monthly/page.js");
  assert.match(page, /requireRole\(ROLE\.ADMIN\)/);
  assert.ok(!/syncAccess/.test(page));
  assert.match(page, /parseMonth\(asked\)/);
  assert.match(page, /Have migrations 0030 to 0033 been run\?/);
  assert.match(page, /robots: NOINDEX_NOFOLLOW/);
  assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(page), "the page only reads");
  const view = read("app/admin/sync/[id]/monthly/MonthlyView.js");
  assert.equal((view.match(/<section className="rp-page">/g) || []).length, 1);
  assert.match(view, /DISCLAIMER/);
  assert.ok(!/dangerouslySetInnerHTML/.test(view) && !/<nav[\s>]/.test(view));
  const google = read("app/admin/sync/[id]/page.js");
  assert.match(google, /\/monthly/);
  assert.match(google, /An admin prints this report/);
});

test("the runbook explains the monthly report", () => {
  assert.match(read("docs/sync/runbook.md"), /### The monthly report/);
});
