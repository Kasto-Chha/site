import { fetchAll, fetchAllChunked } from "./paging";
import { kindDisplay } from "./businessTypes";

// The numbers behind the Sync overview: what the pilot businesses' QR cards, hubs, website badges
// and threads are actually doing. Counts only, per business and in total. It does not follow a
// person from a scan to a post: nothing links them yet, and a ratio of posts to taps would claim
// more than the data can say.

export const DAY = 24 * 60 * 60 * 1000;
// Nepal is UTC+05:45 all year, with no daylight saving. Days are counted in Nepal time, because
// that is the day the team is living in: a scan at 11 p.m. in Kathmandu belongs to that day.
export const NEPAL_OFFSET_MS = 345 * 60 * 1000;
export const CHART_DAYS = 30;

export const RANGES = ["7d", "30d", "all"];
export const RANGE_LABELS = { "7d": "Last 7 days", "30d": "Last 30 days", all: "All time" };

export function parseRange(value) {
  return RANGES.includes(value) ? value : "7d";
}

// Where a range starts, in milliseconds (null: no start, everything).
export function rangeStart(range, now) {
  if (range === "7d") return now - 7 * DAY;
  if (range === "30d") return now - 30 * DAY;
  return null;
}

export function nepalDay(ms) {
  return new Date(ms + NEPAL_OFFSET_MS).toISOString().slice(0, 10);
}

// The last n Nepal days, oldest first, ending today.
export function recentDays(now, n = CHART_DAYS) {
  const days = [];
  for (let i = n - 1; i >= 0; i -= 1) days.push(nepalDay(now - i * DAY));
  return days;
}

const dayNumber = (key) => Math.round(Date.parse(`${key}T00:00:00Z`) / DAY);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-05" -> "5 Oct".
export function shortDay(key) {
  return `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`;
}

// "today", "yesterday", "3 days ago", or a date for anything older than a month. null for no time.
export function relativeDay(iso, now) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const days = dayNumber(nepalDay(now)) - dayNumber(nepalDay(t));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 30) return `${days} days ago`;
  const key = nepalDay(t);
  return `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

// 1234 -> "1,234". Done by hand so the server's locale can never change it.
export function formatCount(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const MERCHANT_COLUMNS = "id, slug, topic_slug, business_name, area, business_kind, kind_label, status, created_at, google_review_url, google_maps_url";

// The pure part: rows in, the overview out. `events` and `posts` must reach back at least as far as
// the range (and, for the chart and the weekly check, at least 30 days).
export function buildOverview({ merchants, qrCodes, events, posts, range = "7d", now = Date.now(), truncated = false }) {
  const since = rangeStart(range, now);
  const weekStart = now - 7 * DAY;
  const inRange = (t) => since === null || t >= since;

  const active = merchants.filter((m) => m.status === "active");
  const byTopic = new Map(active.map((m) => [m.topic_slug, m.id]));
  const per = new Map(active.map((m) => [m.id, { scans: 0, scans7: 0, taps: 0, badgeOpens: 0, badgeClicks: 0, experiences: 0, questions: 0, posts7: 0, last: 0 }]));
  const qrByMerchant = new Map();
  const qrById = new Map();
  for (const qr of qrCodes) {
    if (!qrByMerchant.has(qr.merchant_id)) qrByMerchant.set(qr.merchant_id, []);
    qrByMerchant.get(qr.merchant_id).push(qr);
    qrById.set(qr.id, qr);
  }

  const totals = { scans: 0, taps: { share: 0, google: 0, maps: 0 }, badge: { open: 0, share: 0, ask: 0 }, posts: { experiences: 0, questions: 0 } };
  const daily = new Map(recentDays(now).map((day) => [day, 0]));
  const qrScans = new Map();

  for (const event of events) {
    const m = per.get(event.merchant_id);
    if (!m) continue; // a business that has been removed, or is not known
    const t = Date.parse(event.created_at);
    if (Number.isNaN(t)) continue;
    if (t > m.last) m.last = t;
    const type = event.event_type;
    if (type === "scan") {
      if (t >= weekStart) m.scans7 += 1;
      const day = nepalDay(t);
      if (daily.has(day)) daily.set(day, daily.get(day) + 1);
      if (inRange(t)) {
        m.scans += 1;
        totals.scans += 1;
        if (event.qr_code_id) qrScans.set(event.qr_code_id, (qrScans.get(event.qr_code_id) || 0) + 1);
      }
      continue;
    }
    if (!inRange(t)) continue;
    if (type === "hub_share") { totals.taps.share += 1; m.taps += 1; }
    else if (type === "hub_google") { totals.taps.google += 1; m.taps += 1; }
    else if (type === "hub_maps") { totals.taps.maps += 1; m.taps += 1; }
    else if (type === "badge_open") { totals.badge.open += 1; m.badgeOpens += 1; }
    else if (type === "badge_share") { totals.badge.share += 1; m.badgeClicks += 1; }
    else if (type === "badge_ask") { totals.badge.ask += 1; m.badgeClicks += 1; }
  }

  for (const post of posts) {
    const id = byTopic.get(post.topic_slug);
    const m = id && per.get(id);
    if (!m) continue;
    const t = Date.parse(post.created_at);
    if (Number.isNaN(t)) continue;
    if (t > m.last) m.last = t;
    if (t >= weekStart) m.posts7 += 1;
    if (!inRange(t)) continue;
    if (post.kind === "question") { m.questions += 1; totals.posts.questions += 1; }
    else { m.experiences += 1; totals.posts.experiences += 1; }
  }

  // What a business needs, most urgent first. A business with nothing to fix is "On track".
  const rows = active.map((m) => {
    const x = per.get(m.id);
    const codes = qrByMerchant.get(m.id) || [];
    const activeCodes = codes.filter((c) => c.active).length;
    const issues = [];
    if (codes.length === 0) issues.push({ key: "no_qr", label: "Add a QR code", level: "warn", weight: 3 });
    else if (activeCodes === 0) issues.push({ key: "qr_off", label: "QR codes switched off", level: "warn", weight: 3 });
    else if (x.scans7 === 0) issues.push({ key: "no_scans", label: "No scans this week", level: "warn", weight: 2 });
    if (!m.google_review_url && !m.google_maps_url) issues.push({ key: "no_google", label: "No Google link yet", level: "info", weight: 1 });
    return {
      id: m.id,
      slug: m.slug,
      name: m.business_name,
      area: m.area,
      kindName: kindDisplay(m.business_kind, m.kind_label),
      codes: codes.length,
      activeCodes,
      scans: x.scans,
      scans7: x.scans7,
      taps: x.taps,
      badgeOpens: x.badgeOpens,
      badgeClicks: x.badgeClicks,
      experiences: x.experiences,
      questions: x.questions,
      posts: x.experiences + x.questions,
      posts7: x.posts7,
      lastActivity: x.last ? new Date(x.last).toISOString() : null,
      issues,
      status: issues[0] || { key: "ok", label: "On track", level: "ok", weight: 0 },
      severity: issues.reduce((sum, issue) => sum + issue.weight, 0)
    };
  });
  rows.sort((a, b) => b.severity - a.severity || b.scans - a.scans || a.name.localeCompare(b.name));

  const names = new Map(active.map((m) => [m.id, m.business_name]));
  const topCodes = [...qrScans]
    .map(([id, scans]) => ({ id, scans, label: qrById.get(id)?.label ?? "Table", business: names.get(qrById.get(id)?.merchant_id) ?? "" }))
    .filter((c) => c.business)
    .sort((a, b) => b.scans - a.scans || a.label.localeCompare(b.label))
    .slice(0, 8);

  return {
    range,
    rangeLabel: RANGE_LABELS[range],
    activeBusinesses: active.length,
    withoutActiveCode: rows.filter((r) => r.activeCodes === 0).length,
    needAttention: rows.filter((r) => r.severity >= 2).length,
    totals: { ...totals, tapsTotal: totals.taps.share + totals.taps.google + totals.taps.maps, badgeClicks: totals.badge.share + totals.badge.ask, postsTotal: totals.posts.experiences + totals.posts.questions },
    daily: [...daily].map(([day, scans]) => ({ day, scans })),
    rows,
    topCodes,
    truncated
  };
}

// The reading part. Every query is paged (see paging.js) and any failure throws, so the page can
// say it could not load rather than show zeros that look real.
export async function loadOverview(supabase, { range = "7d", now = Date.now() } = {}) {
  const chosen = parseRange(range);
  const since = rangeStart(chosen, now);
  // Always at least 30 days back: the chart and the weekly check need them whatever the range.
  const loadFrom = since === null ? null : Math.min(since, now - CHART_DAYS * DAY);
  const from = loadFrom === null ? null : new Date(loadFrom).toISOString();

  const merchants = await fetchAll(() => supabase.from("sync_merchants").select(MERCHANT_COLUMNS).order("created_at", { ascending: true }).order("id", { ascending: true }));
  const codes = await fetchAll(() => supabase.from("sync_qr_codes").select("id, merchant_id, code, label, active").order("created_at", { ascending: true }).order("id", { ascending: true }));
  const events = await fetchAll(() => {
    let query = supabase.from("sync_events").select("merchant_id, qr_code_id, event_type, created_at").order("created_at", { ascending: true }).order("id", { ascending: true });
    if (from) query = query.gte("created_at", from);
    return query;
  });
  const slugs = merchants.rows.filter((m) => m.status === "active").map((m) => m.topic_slug);
  const posts = await fetchAllChunked(slugs, 40, (chunk) => {
    let query = supabase.from("reviews").select("topic_slug, kind, created_at").in("topic_slug", chunk).order("created_at", { ascending: true }).order("id", { ascending: true });
    if (from) query = query.gte("created_at", from);
    return query;
  });

  return buildOverview({
    merchants: merchants.rows,
    qrCodes: codes.rows,
    events: events.rows,
    posts: posts.rows,
    range: chosen,
    now,
    truncated: merchants.truncated || codes.truncated || events.truncated || posts.truncated
  });
}
