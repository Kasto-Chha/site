// The monthly report (patch 14k): one month of a business, built from what the team typed in (the Google numbers, the profile checks)
// and what the team did (posts, replies, tasks). Pure: the page reads the rows and this works out what to print. No causes are
// claimed: the numbers are shown beside last month's, and the work beside the numbers.

import { KIND_LABELS } from "./posts";
import { TASK_TYPE_LABELS } from "./tasks";
import { evaluate } from "./health";
import { monthLabel, parseMonth } from "./googleNumbers";
import { nepalDay } from "./time";

export const DISCLAIMER = "The figures come from this business's own Google Business Profile and were typed in by our team. Calls, direction requests and profile views are counted by Google. This report shows what happened and what we did; it does not claim that one caused the other, and it does not promise any result.";

const METRICS = [
  { key: "calls", column: "calls", label: "Calls from Google" },
  { key: "directions", column: "directions", label: "Direction requests" },
  { key: "views", column: "profile_views", label: "Profile views" }
];

// "2026-10" -> { start: "2026-10-01", end: "2026-11-01" } (end is the first day after the month), or null.
export function monthRange(month) {
  const start = parseMonth(month);
  if (!start) return null;
  const year = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7));
  const end = m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, end };
}

export function previousMonth(month) {
  const range = monthRange(month);
  if (!range) return null;
  const year = Number(range.start.slice(0, 4));
  const m = Number(range.start.slice(5, 7));
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`;
}

const inRange = (day, range) => typeof day === "string" && day.slice(0, 10) >= range.start && day.slice(0, 10) < range.end;
const rowFor = (numbers, month) => numbers.find((row) => String(row.month).slice(0, 7) === month) || null;

// Change against last month: only when both are typed in. Never a percent of zero.
export function change(now, before) {
  if (typeof now !== "number" || typeof before !== "number") return null;
  const delta = Math.round((now - before) * 10) / 10;
  return { delta, percent: before > 0 ? Math.round((delta / before) * 100) : null };
}

function count(list, keyOf, labels) {
  const out = {};
  for (const item of list) out[keyOf(item)] = (out[keyOf(item)] || 0) + 1;
  return Object.entries(out).map(([key, n]) => ({ key, label: labels[key] || key, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

// merchant: { business_name, area }. month: "2026-10". The rest are the rows as the database gives them.
export function buildMonthly({ merchant, month, numbers = [], checks = [], posts = [], replies = [], tasks = [] }) {
  const range = monthRange(month);
  if (!range) return null;
  const prev = previousMonth(month);
  const now = rowFor(numbers, month.slice(0, 7));
  const before = rowFor(numbers, prev);

  const metrics = METRICS.map((metric) => ({ key: metric.key, label: metric.label, value: now?.[metric.column] ?? null, before: before?.[metric.column] ?? null, change: change(now?.[metric.column], before?.[metric.column]) }));
  const rating = { value: now?.rating ?? null, before: before?.rating ?? null };
  const reviews = { value: now?.reviews ?? null, before: before?.reviews ?? null, change: change(now?.reviews, before?.reviews) };

  const donePosts = posts.filter((p) => p.status === "published" && inRange(p.published_on, range));
  const doneReplies = replies.filter((r) => r.status === "posted" && inRange(r.posted_on, range));
  const doneTasks = tasks.filter((t) => t.status === "done" && t.done_at && inRange(nepalDay(Date.parse(t.done_at)), range));

  // The profile check standing at the end of the month, and the one before it, to show the direction.
  const sorted = checks.slice().sort((a, b) => String(b.checked_on).localeCompare(String(a.checked_on)) || String(b.created_at).localeCompare(String(a.created_at)));
  const standing = sorted.find((c) => String(c.checked_on) < range.end) || null;
  const earlier = sorted.find((c) => String(c.checked_on) < range.start) || null;
  const health = standing ? { score: standing.score, passing: standing.passing, failing: standing.failing, checkedOn: standing.checked_on, before: earlier && earlier !== standing ? earlier.score : null } : null;

  // What is still to fix on the newest check (whatever its month): the focus for next month, at most five.
  const next = sorted[0] ? evaluate(sorted[0].facts).results.filter((r) => r.state === "fix").slice(0, 5).map((r) => r.label) : [];

  return {
    month: month.slice(0, 7),
    label: monthLabel(range.start),
    previousLabel: monthLabel(`${prev}-01`),
    name: merchant?.business_name || "",
    area: merchant?.area || "",
    hasNumbers: Boolean(now),
    hasPrevious: Boolean(before),
    metrics, rating, reviews,
    note: now?.note || "",
    work: {
      posts: { total: donePosts.length, byKind: count(donePosts, (p) => p.kind, KIND_LABELS) },
      replies: doneReplies.length,
      tasks: { total: doneTasks.length, byType: count(doneTasks, (t) => t.task_type, TASK_TYPE_LABELS) }
    },
    health,
    next
  };
}
