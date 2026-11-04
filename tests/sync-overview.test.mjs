// The Sync overview: the numbers, the paging that keeps them honest past 1,000 rows, the Nepal-time days,
// and the look that must stay inside the Sync section.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { fetchAll, fetchAllChunked, PAGE_SIZE } = await import("../lib/sync/paging.js");
const O = await import("../lib/sync/overview.js");
const { buildOverview, loadOverview, parseRange, rangeStart, nepalDay, recentDays, relativeDay, formatCount, shortDay, DAY } = O;
const { SYNC_NAV, currentNav } = await import("../lib/sync/nav.js");
const { listQrCodes } = await import("../lib/sync/qr.js");
const { badgeStats } = await import("../lib/sync/badge.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");

const fake = new FakePostgrest();
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const saved = {};
let savedConsoleError;

before(async () => {
  await fake.listen();
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  savedConsoleError = console.error;
});
after(async () => {
  console.error = savedConsoleError;
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await fake.close();
});
beforeEach(() => {
  fake.reset();
  console.error = () => {};
});

const NOW = Date.UTC(2026, 10, 4, 12, 0, 0); // 4 Nov 2026, 17:45 in Nepal
const iso = (ms) => new Date(ms).toISOString();
const ago = (days) => iso(NOW - days * DAY);

// ---------- time ----------

test("ranges: anything unknown is the last 7 days", () => {
  assert.equal(parseRange("7d"), "7d");
  assert.equal(parseRange("30d"), "30d");
  assert.equal(parseRange("all"), "all");
  for (const bad of [undefined, null, "", "90d", "ALL", "7D", "7d ", 7, {}, ["all"], "all&x=1"]) assert.equal(parseRange(bad), "7d", String(bad));
  assert.equal(rangeStart("7d", NOW), NOW - 7 * DAY);
  assert.equal(rangeStart("30d", NOW), NOW - 30 * DAY);
  assert.equal(rangeStart("all", NOW), null);
});

test("a day is a Nepal day: it turns over at 18:15 UTC, a quarter past six in the evening in Britain, midnight in Kathmandu", () => {
  assert.equal(nepalDay(Date.UTC(2026, 10, 3, 18, 14, 59, 999)), "2026-11-03");
  assert.equal(nepalDay(Date.UTC(2026, 10, 3, 18, 15, 0, 0)), "2026-11-04");
  assert.equal(nepalDay(Date.UTC(2026, 10, 4, 18, 14, 59, 999)), "2026-11-04");
  assert.equal(nepalDay(Date.UTC(2026, 11, 31, 18, 30)), "2027-01-01", "across a year");
  assert.equal(nepalDay(Date.UTC(2028, 1, 28, 18, 30)), "2028-02-29", "a leap day");
});

test("the chart's days are thirty consecutive Nepal days ending today", () => {
  const days = recentDays(NOW);
  assert.equal(days.length, 30);
  assert.equal(days[29], "2026-11-04");
  assert.equal(days[0], "2026-10-06");
  assert.equal(new Set(days).size, 30);
  for (let i = 1; i < days.length; i += 1) assert.equal(Date.parse(days[i]) - Date.parse(days[i - 1]), DAY);
  assert.deepEqual(recentDays(NOW, 3), ["2026-11-02", "2026-11-03", "2026-11-04"]);
});

test("dates read as words, in Nepal days", () => {
  assert.equal(relativeDay(iso(NOW - 3600_000), NOW), "today");
  assert.equal(relativeDay(iso(NOW + 3600_000), NOW), "today", "a clock a little ahead is still today");
  assert.equal(relativeDay(iso(Date.UTC(2026, 10, 3, 18, 14)), NOW), "yesterday", "18:14 UTC is still yesterday in Nepal");
  assert.equal(relativeDay(iso(Date.UTC(2026, 10, 3, 18, 15)), NOW), "today", "18:15 UTC is today in Nepal");
  assert.equal(relativeDay(ago(2), NOW), "2 days ago");
  assert.equal(relativeDay(ago(30), NOW), "30 days ago");
  assert.equal(relativeDay(ago(31), NOW), "4 Oct 2026");
  assert.equal(relativeDay(ago(400), NOW), "30 Sep 2025");
  for (const none of [null, undefined, "", "not a date"]) assert.equal(relativeDay(none, NOW), null, String(none));
  assert.equal(shortDay("2026-10-05"), "5 Oct");
  assert.equal(shortDay("2026-12-25"), "25 Dec");
});

test("counts read with commas, whatever the server's locale", () => {
  assert.deepEqual([0, 7, 999, 1000, 12345, 1234567, 1e9].map(formatCount), ["0", "7", "999", "1,000", "12,345", "1,234,567", "1,000,000,000"]);
  for (const odd of [null, undefined, NaN, "x", -0]) assert.equal(formatCount(odd), "0", String(odd));
  assert.equal(formatCount("42"), "42");
  assert.equal(formatCount(2.6), "3");
});

// ---------- paging ----------

const seedEvents = (n, make) => { for (let i = 0; i < n; i += 1) fake.tables.sync_events.push({ id: `e${String(i).padStart(6, "0")}`, merchant_id: "m", qr_code_id: null, event_type: "scan", created_at: iso(Date.UTC(2026, 0, 1) + i * 1000), ...(make ? make(i) : {}) }); };
const eventsQuery = () => createServerSupabase().from("sync_events").select("id").order("created_at", { ascending: true }).order("id", { ascending: true });

test("the test database mimics the real server's cap, so the fix can be proved", async () => {
  fake.maxRows = 1000;
  seedEvents(2500);
  const { data } = await createServerSupabase().from("sync_events").select("id").limit(50000);
  assert.equal(data.length, 1000, "a single request, however large a limit it asks for, stops at 1,000 and says nothing");
  const head = await createServerSupabase().from("sync_events").select("*", { count: "exact", head: true });
  assert.equal(head.count, 2500, "an exact count is not cut short");
});

test("paging reads every row past the cap, in order, with none missed or repeated", async () => {
  fake.maxRows = 1000;
  seedEvents(2500);
  const { rows, truncated } = await fetchAll(eventsQuery);
  assert.equal(rows.length, 2500);
  assert.equal(truncated, false);
  assert.equal(new Set(rows.map((r) => r.id)).size, 2500);
  assert.deepEqual(rows.map((r) => r.id), [...rows.map((r) => r.id)].sort());
  assert.equal(PAGE_SIZE, 1000, "never ask for more than the server will give");
});

test("rows that share a timestamp are not skipped or repeated between pages", async () => {
  fake.maxRows = 1000;
  seedEvents(2500, () => ({ created_at: "2026-01-01T00:00:00.000Z" }));
  const { rows } = await fetchAll(eventsQuery);
  assert.equal(rows.length, 2500);
  assert.equal(new Set(rows.map((r) => r.id)).size, 2500);
});

test("exact multiples of a page, empty tables and short tables are all right", async () => {
  fake.maxRows = 1000;
  for (const n of [0, 1, 999, 1000, 1001, 2000, 2999, 3000]) {
    fake.tables.sync_events.length = 0;
    seedEvents(n);
    const { rows, truncated } = await fetchAll(eventsQuery);
    assert.equal(rows.length, n, `${n} rows`);
    assert.equal(truncated, false, `${n} rows`);
  }
});

test("a read that gives up says so, instead of passing a partial count off as whole", async () => {
  seedEvents(100);
  const part = await fetchAll(eventsQuery, { pageSize: 10, maxPages: 3 });
  assert.equal(part.rows.length, 30);
  assert.equal(part.truncated, true);
  const whole = await fetchAll(eventsQuery, { pageSize: 10, maxPages: 11 });
  assert.equal(whole.rows.length, 100);
  assert.equal(whole.truncated, false, "ten full pages and an empty eleventh: that is the end, not a cut-off");
});

test("a failure part-way is a failure, never a short list", async () => {
  seedEvents(50);
  fake.failReadsFrom = "sync_events";
  await assert.rejects(() => fetchAll(eventsQuery), /./);
});

test("a long list of values is read in chunks, each read in full", async () => {
  fake.maxRows = 1000;
  for (let i = 0; i < 95; i += 1) for (let j = 0; j < 12; j += 1) fake.tables.reviews.push({ id: `r-${i}-${j}`, topic_slug: `t${i}`, kind: "experience", created_at: iso(NOW - j * 1000) });
  const values = Array.from({ length: 95 }, (_, i) => `t${i}`);
  const before = fake.requests.length;
  const { rows, truncated } = await fetchAllChunked(values, 40, (chunk) => createServerSupabase().from("reviews").select("topic_slug").in("topic_slug", chunk).order("created_at").order("id"));
  assert.equal(rows.length, 95 * 12);
  assert.equal(truncated, false);
  assert.ok(fake.requests.length - before >= 3, "three chunks, at least");
  assert.deepEqual((await fetchAllChunked([], 40, () => { throw new Error("must not be called"); })).rows, []);
});

// ---------- the counts of patches 4 and 4b, past the cap ----------

test("a table's scan count is exact past 1,000 scans (it used to stop at 1,000)", async () => {
  fake.maxRows = 1000;
  fake.tables.sync_qr_codes.push({ id: "q1", merchant_id: "m", code: "abc3k9xq", label: "Counter", active: true, created_at: ago(40) });
  // 2,500 scans, 100 on each of 25 days old (0 to 24). A week reaches back 7 whole days, inclusive.
  for (let i = 0; i < 2500; i += 1) fake.tables.sync_events.push({ id: `e${i}`, merchant_id: "m", qr_code_id: "q1", event_type: "scan", created_at: iso(NOW - (i % 25) * DAY) });
  const [code] = await listQrCodes(createServerSupabase(), "m", { now: NOW });
  assert.equal(code.scans, 2500);
  assert.equal(code.scans7, 800, "ages 0 to 7: eight days of 100, which is neither 1,000 nor 2,500");
});

test("the badge's counts are exact past 1,000 events", async () => {
  fake.maxRows = 1000;
  for (let i = 0; i < 2300; i += 1) fake.tables.sync_events.push({ id: `b${i}`, merchant_id: "m", event_type: ["badge_open", "badge_share", "badge_ask"][i % 3], created_at: iso(NOW - (i % 10) * DAY) });
  const stats = await badgeStats(createServerSupabase(), "m", { now: NOW });
  assert.deepEqual([stats.badge_open.total, stats.badge_share.total, stats.badge_ask.total], [767, 767, 766]);
  assert.equal(stats.badge_open.total + stats.badge_share.total + stats.badge_ask.total, 2300);
});

// ---------- the numbers ----------

const A = { id: "mA", slug: "himal", topic_slug: "himal-x", business_name: "Himal Brew House", area: "Jhamsikhel", business_kind: "cafe", kind_label: null, status: "active", created_at: ago(60), google_review_url: "https://g.page/r/a/review", google_maps_url: null };
const B = { id: "mB", slug: "momo", topic_slug: "momo-x", business_name: "Momo Hub", area: "Pulchowk", business_kind: "restaurant", kind_label: null, status: "active", created_at: ago(60), google_review_url: null, google_maps_url: null };
const C = { id: "mC", slug: "kettle", topic_slug: "kettle-x", business_name: "Kupondol Kettle", area: "Kupondol", business_kind: "cafe", kind_label: null, status: "active", created_at: ago(60), google_review_url: "https://g.page/r/c/review", google_maps_url: null };
const D = { id: "mD", slug: "gone", topic_slug: "gone-x", business_name: "Gone Cafe", area: "X", business_kind: "cafe", kind_label: null, status: "cancelled", created_at: ago(60), google_review_url: null, google_maps_url: null };
const E = { id: "mE", slug: "newcafe", topic_slug: "newcafe-x", business_name: "New Cafe", area: "Lazimpat", business_kind: "cafe", kind_label: "", status: "active", created_at: ago(2), google_review_url: "https://g.page/r/e/review", google_maps_url: null };
const QR = (id, merchant_id, label, active = true) => ({ id, merchant_id, code: id.padEnd(8, "x"), label, active });
const CODES = [QR("qA1", "mA", "Counter"), QR("qA2", "mA", "Table 4"), QR("qC1", "mC", "Window", false), QR("qE1", "mE", "Door"), QR("qD1", "mD", "Old")];
const ev = (merchant_id, event_type, when, qr_code_id = null) => ({ merchant_id, qr_code_id, event_type, created_at: typeof when === "string" ? when : iso(when) });

const EVENTS = [
  ev("mA", "scan", ago(0.5), "qA1"), ev("mA", "scan", ago(1), "qA1"), ev("mA", "scan", ago(3), "qA2"), ev("mA", "scan", ago(6.9), "qA1"),
  ev("mA", "scan", ago(10), "qA1"), ev("mA", "scan", ago(25), "qA2"), ev("mA", "scan", ago(45), "qA1"), ev("mA", "scan", ago(2), null),
  ev("mA", "hub_share", ago(1)), ev("mA", "hub_share", ago(20)), ev("mA", "hub_google", ago(1)), ev("mA", "hub_maps", ago(9)),
  ev("mA", "badge_open", ago(2)), ev("mA", "badge_share", ago(2)), ev("mA", "badge_ask", ago(15)), ev("mA", "badge_open", ago(50)),
  ev("mB", "hub_share", ago(1)),
  ev("mC", "scan", ago(12), "qC1"),
  ev("mD", "scan", ago(1), "qD1"), ev("mD", "hub_share", ago(1)),
  ev("ghost", "scan", ago(1), "qG")
];
const POSTS = [
  { topic_slug: "himal-x", kind: "experience", created_at: ago(1) }, { topic_slug: "himal-x", kind: "experience", created_at: ago(8) },
  { topic_slug: "himal-x", kind: "question", created_at: ago(3) }, { topic_slug: "himal-x", kind: "experience", created_at: ago(100) },
  { topic_slug: "momo-x", kind: "question", created_at: ago(5) },
  { topic_slug: "gone-x", kind: "experience", created_at: ago(1) }, { topic_slug: "nobody-x", kind: "experience", created_at: ago(1) }
];
const build = (range, over = {}) => buildOverview({ merchants: [A, B, C, D, E], qrCodes: CODES, events: EVENTS, posts: POSTS, range, now: NOW, ...over });

test("last 7 days: exact totals for every kind of event", () => {
  const o = build("7d");
  assert.equal(o.rangeLabel, "Last 7 days");
  assert.equal(o.totals.scans, 5, "4 with a table, 1 whose table is unknown (days 0.5, 1, 2, 3, 6.9)");
  assert.deepEqual(o.totals.taps, { share: 2, google: 1, maps: 0 });
  assert.equal(o.totals.tapsTotal, 3);
  assert.deepEqual(o.totals.badge, { open: 1, share: 1, ask: 0 });
  assert.equal(o.totals.badgeClicks, 1);
  assert.deepEqual(o.totals.posts, { experiences: 1, questions: 2 });
  assert.equal(o.totals.postsTotal, 3);
});

test("last 30 days and all time widen the same counts, exactly", () => {
  const m = build("30d");
  assert.equal(m.rangeLabel, "Last 30 days");
  assert.equal(m.totals.scans, 8, "A: 0.5, 1, 2, 3, 6.9, 10, 25 days (7) and C: 12 days (1)");
  assert.deepEqual(m.totals.taps, { share: 3, google: 1, maps: 1 });
  assert.deepEqual(m.totals.badge, { open: 1, share: 1, ask: 1 });
  assert.deepEqual(m.totals.posts, { experiences: 2, questions: 2 });
  const all = build("all");
  assert.equal(all.rangeLabel, "All time");
  assert.equal(all.totals.scans, 9, "adds the scan 45 days ago");
  assert.deepEqual(all.totals.taps, { share: 3, google: 1, maps: 1 });
  assert.deepEqual(all.totals.badge, { open: 2, share: 1, ask: 1 }, "adds the open 50 days ago");
  assert.deepEqual(all.totals.posts, { experiences: 3, questions: 2 }, "adds the post 100 days ago");
});

test("a business that was removed, and a business nobody knows, count for nothing", () => {
  const o = build("all");
  assert.equal(o.totals.scans, 9, "the cancelled business's scan and the unknown business's scan are not in it");
  assert.equal(o.totals.taps.share, 3, "nor is the removed business's tap");
  assert.equal(o.totals.posts.experiences, 3, "nor posts on a removed business's thread, or a thread nobody tagged");
  assert.equal(o.rows.some((r) => r.name === "Gone Cafe"), false);
  assert.equal(o.activeBusinesses, 4);
});

test("a range includes its first instant and excludes the one before", () => {
  const edge = (when) => buildOverview({ merchants: [A], qrCodes: [QR("qA1", "mA", "Counter")], events: [ev("mA", "scan", when, "qA1")], posts: [], range: "7d", now: NOW });
  assert.equal(edge(NOW - 7 * DAY).totals.scans, 1, "exactly seven days ago is in");
  assert.equal(edge(NOW - 7 * DAY - 1).totals.scans, 0, "a millisecond earlier is out");
  assert.equal(edge(NOW - 7 * DAY).rows[0].scans7, 1);
  assert.equal(edge(NOW - 7 * DAY - 1).rows[0].scans7, 0);
  const thirty = (when) => buildOverview({ merchants: [A], qrCodes: [], events: [ev("mA", "hub_share", when)], posts: [], range: "30d", now: NOW });
  assert.equal(thirty(NOW - 30 * DAY).totals.taps.share, 1);
  assert.equal(thirty(NOW - 30 * DAY - 1).totals.taps.share, 0);
});

test("each business: its own counts, in the range, and its status from the last 7 days whatever the range", () => {
  for (const range of ["7d", "30d", "all"]) {
    const a = build(range).rows.find((r) => r.id === "mA");
    assert.equal(a.scans7, 5, `${range}: the weekly check does not move with the range`);
    assert.equal(a.status.label, "On track", range);
  }
  const a = build("7d").rows.find((r) => r.id === "mA");
  assert.deepEqual({ scans: a.scans, taps: a.taps, badgeOpens: a.badgeOpens, badgeClicks: a.badgeClicks, experiences: a.experiences, questions: a.questions, posts: a.posts, posts7: a.posts7, codes: a.codes, activeCodes: a.activeCodes }, { scans: 5, taps: 2, badgeOpens: 1, badgeClicks: 1, experiences: 1, questions: 1, posts: 2, posts7: 2, codes: 2, activeCodes: 2 });
  assert.equal(a.lastActivity, ago(0.5));
  assert.equal(a.kindName, "Cafe");
  const wide = build("all").rows.find((r) => r.id === "mA");
  assert.equal(wide.scans, 8);
  assert.equal(wide.posts, 4);
  assert.equal(wide.posts7, 2, "posts in the last 7 days do not move with the range either");
});

test("what each business needs, worked out one by one", () => {
  const rows = Object.fromEntries(build("7d").rows.map((r) => [r.id, r]));
  assert.deepEqual(rows.mB.issues.map((i) => i.key), ["no_qr", "no_google"], "no QR code is the first thing; no Google link is a later one");
  assert.equal(rows.mB.status.label, "Add a QR code");
  assert.deepEqual(rows.mC.issues.map((i) => i.key), ["qr_off"], "its only code is switched off, and it has a Google link");
  assert.equal(rows.mC.status.label, "QR codes switched off");
  assert.deepEqual(rows.mE.issues.map((i) => i.key), ["no_scans"]);
  assert.equal(rows.mE.status.label, "No scans this week");
  assert.deepEqual(rows.mA.issues, []);
  assert.equal(rows.mA.status.level, "ok");
  assert.deepEqual([rows.mB.severity, rows.mC.severity, rows.mE.severity, rows.mA.severity], [4, 3, 2, 0]);
  assert.equal(rows.mB.status.level, "warn");
});

test("a business with a Google link only for Maps, or only for reviews, has no 'Google link' to-do", () => {
  const withMaps = { ...B, google_maps_url: "https://maps.app.goo.gl/x" };
  const row = buildOverview({ merchants: [withMaps], qrCodes: [QR("q", "mB", "T")], events: [ev("mB", "scan", ago(1), "q")], posts: [], now: NOW }).rows[0];
  assert.deepEqual(row.issues, []);
});

test("the businesses are listed with those needing something first", () => {
  assert.deepEqual(build("7d").rows.map((r) => r.id), ["mB", "mC", "mE", "mA"]);
  const o = build("7d");
  assert.equal(o.needAttention, 3, "B, C and E");
  assert.equal(o.withoutActiveCode, 2, "B has no code and C's is off");
  assert.equal(o.activeBusinesses, 4);
});

test("equal needs are ordered by scans, then by name", () => {
  const mk = (id, name) => ({ ...A, id, topic_slug: `${id}-x`, business_name: name });
  const codes = ["x", "y", "z"].map((k) => QR(`q${k}`, `m${k}`, "T"));
  const events = [ev("my", "scan", ago(1), "qy"), ev("my", "scan", ago(1), "qy"), ev("mz", "scan", ago(1), "qz"), ev("mx", "scan", ago(1), "qx")];
  const rows = buildOverview({ merchants: [mk("mx", "Zeta"), mk("my", "Beta"), mk("mz", "Alpha")], qrCodes: codes, events, posts: [], now: NOW }).rows;
  assert.deepEqual(rows.map((r) => r.name), ["Beta", "Alpha", "Zeta"], "most scans first; Alpha and Zeta tie on one scan, so by name");
});

test("the most scanned codes, most first, only for businesses that are on, and only codes that were scanned", () => {
  assert.deepEqual(build("7d").topCodes.map((c) => [c.label, c.business, c.scans]), [["Counter", "Himal Brew House", 3], ["Table 4", "Himal Brew House", 1]]);
  assert.deepEqual(build("30d").topCodes.map((c) => [c.label, c.scans]), [["Counter", 4], ["Table 4", 2], ["Window", 1]]);
  assert.deepEqual(build("all").topCodes.map((c) => [c.label, c.scans]), [["Counter", 5], ["Table 4", 2], ["Window", 1]]);
  assert.ok(!build("all").topCodes.some((c) => c.label === "Old"), "a removed business's card is not listed");
});

test("at most eight codes are listed", () => {
  const codes = Array.from({ length: 12 }, (_, i) => QR(`q${i}`, "mA", `Table ${i}`));
  const events = codes.flatMap((c, i) => Array.from({ length: i + 1 }, () => ev("mA", "scan", ago(1), c.id)));
  const top = buildOverview({ merchants: [A], qrCodes: codes, events, posts: [], now: NOW }).topCodes;
  assert.equal(top.length, 8);
  assert.deepEqual(top.map((c) => c.scans), [12, 11, 10, 9, 8, 7, 6, 5]);
});

test("the chart: thirty Nepal days, with every scan on the right one, whatever the range", () => {
  const nonZero = (o) => o.daily.filter((d) => d.scans > 0).map((d) => [d.day, d.scans]);
  const expected = [["2026-10-10", 1], ["2026-10-23", 1], ["2026-10-25", 1], ["2026-10-28", 1], ["2026-11-01", 1], ["2026-11-02", 1], ["2026-11-03", 1], ["2026-11-04", 1]];
  for (const range of ["7d", "30d", "all"]) {
    const o = build(range);
    assert.equal(o.daily.length, 30);
    assert.equal(o.daily[29].day, "2026-11-04");
    assert.deepEqual(nonZero(o), expected, range);
  }
  assert.ok(!build("all").daily.some((d) => d.day === "2026-09-20"), "the scan 45 days ago is in the totals but not on a 30-day chart");
});

test("a scan just before and just after Nepal's midnight lands on different days", () => {
  const scan = (when) => buildOverview({ merchants: [A], qrCodes: [], events: [ev("mA", "scan", when)], posts: [], now: Date.UTC(2026, 10, 4, 20, 0) });
  const before = scan(Date.UTC(2026, 10, 3, 18, 14, 59)).daily.find((d) => d.scans);
  const after = scan(Date.UTC(2026, 10, 3, 18, 15, 0)).daily.find((d) => d.scans);
  assert.equal(before.day, "2026-11-03");
  assert.equal(after.day, "2026-11-04");
});

test("a scan whose table has since been deleted still counts, but is no table's", () => {
  const o = build("7d");
  assert.equal(o.totals.scans, 5);
  assert.equal(o.topCodes.reduce((sum, c) => sum + c.scans, 0), 4, "the one with no table is in the total, not in any table's");
});

test("when nothing has happened, everything is zero and nothing breaks", () => {
  const o = buildOverview({ merchants: [], qrCodes: [], events: [], posts: [], now: NOW });
  assert.equal(o.activeBusinesses, 0);
  assert.deepEqual(o.rows, []);
  assert.deepEqual(o.topCodes, []);
  assert.equal(o.totals.scans, 0);
  assert.equal(o.daily.length, 30);
  assert.ok(o.daily.every((d) => d.scans === 0));
  const quiet = buildOverview({ merchants: [A], qrCodes: [], events: [], posts: [], now: NOW });
  assert.equal(quiet.rows[0].lastActivity, null);
  assert.equal(quiet.rows[0].status.label, "Add a QR code");
});

test("rows with an unreadable date are ignored, not counted and not fatal", () => {
  const o = buildOverview({ merchants: [A], qrCodes: [], events: [ev("mA", "scan", "not a date"), ev("mA", "hub_share", ""), ev("mA", "scan", ago(1))], posts: [{ topic_slug: "himal-x", kind: "experience", created_at: "garbage" }], now: NOW });
  assert.equal(o.totals.scans, 1);
  assert.equal(o.totals.taps.share, 0);
  assert.equal(o.totals.posts.experiences, 0);
});

test("an event type the overview does not know is ignored, never counted as something else", () => {
  const o = buildOverview({ merchants: [A], qrCodes: [], events: [ev("mA", "post_created", ago(1)), ev("mA", "google_copy", ago(1)), ev("mA", "hub_ask", ago(1)), ev("mA", "mystery", ago(1))], posts: [], now: NOW });
  assert.deepEqual([o.totals.scans, o.totals.tapsTotal, o.totals.badge.open, o.totals.badgeClicks], [0, 0, 0, 0]);
});

test("a read that was cut short is passed on, so the page can say the totals are a minimum", () => {
  assert.equal(build("7d", { truncated: true }).truncated, true);
  assert.equal(build("7d").truncated, false);
});

// ---------- reading it all from the database ----------

function seed(extraEvents = []) {
  fake.tables.sync_merchants.push(A, B, C, D, E);
  fake.tables.sync_qr_codes.push(...CODES);
  let n = 0;
  for (const e of [...EVENTS, ...extraEvents]) fake.tables.sync_events.push({ id: `ev${String(++n).padStart(6, "0")}`, ...e });
  let p = 0;
  for (const post of POSTS) fake.tables.reviews.push({ id: `rv${String(++p).padStart(6, "0")}`, ...post });
}

test("read from the database, the overview is the one the numbers describe, for every range", async () => {
  seed();
  for (const range of ["7d", "30d", "all"]) {
    const loaded = await loadOverview(createServerSupabase(), { range, now: NOW });
    const expected = build(range);
    assert.deepEqual(loaded.totals, expected.totals, range);
    assert.deepEqual(loaded.rows.map((r) => [r.id, r.scans, r.posts, r.status.key]), expected.rows.map((r) => [r.id, r.scans, r.posts, r.status.key]), range);
    assert.deepEqual(loaded.daily, expected.daily, range);
    assert.deepEqual(loaded.topCodes, expected.topCodes, range);
  }
});

test("an unknown range reads as the last 7 days", async () => {
  seed();
  assert.equal((await loadOverview(createServerSupabase(), { range: "banana", now: NOW })).range, "7d");
});

test("it asks only for what it needs: nothing older than 30 days unless it is all time", async () => {
  seed();
  const asked = async (range) => {
    const before = fake.requests.length;
    await loadOverview(createServerSupabase(), { range, now: NOW });
    return fake.requests.slice(before).filter((r) => r.table === "sync_events" || r.table === "reviews").map((r) => decodeURIComponent(r.query));
  };
  const week = await asked("7d");
  assert.ok(week.length >= 2 && week.every((u) => u.includes(`created_at=gte.${iso(NOW - 30 * DAY)}`)), `the 7-day view still reads 30 days (the chart and the weekly check need them): ${week[0]}`);
  const month = await asked("30d");
  assert.ok(month.every((u) => u.includes(`created_at=gte.${iso(NOW - 30 * DAY)}`)));
  const all = await asked("all");
  assert.ok(all.every((u) => !u.includes("created_at=gte.")), "all time asks for everything");
});

test("past the server's cap, the totals are still exact", async () => {
  fake.maxRows = 1000;
  seed();
  fake.tables.sync_qr_codes.push(QR("qBig", "mA", "Big"));
  for (let i = 0; i < 2600; i += 1) fake.tables.sync_events.push({ id: `big${String(i).padStart(6, "0")}`, merchant_id: "mA", qr_code_id: "qBig", event_type: "scan", created_at: iso(NOW - 1000 - i * 60_000) });
  const o = await loadOverview(createServerSupabase(), { range: "7d", now: NOW });
  // The generated scans run from a second ago back 43 hours, so every one is inside the week.
  assert.equal(o.totals.scans, 5 + 2600, "5 from the fixtures and all 2,600 generated ones: none lost at 1,000");
  assert.ok(o.totals.scans > 1000);
  assert.equal(o.truncated, false);
  const wide = await loadOverview(createServerSupabase(), { range: "all", now: NOW });
  assert.equal(wide.totals.scans, 9 + 2600);
});

test("many businesses: their posts are read in chunks, and counted in full", async () => {
  const merchants = Array.from({ length: 95 }, (_, i) => ({ ...A, id: `m${i}`, slug: `b${i}`, topic_slug: `b${i}-x`, business_name: `Biz ${String(i).padStart(3, "0")}` }));
  fake.tables.sync_merchants.push(...merchants);
  for (let i = 0; i < 95; i += 1) for (let j = 0; j < 12; j += 1) fake.tables.reviews.push({ id: `r${i}-${j}`, topic_slug: `b${i}-x`, kind: j % 4 === 0 ? "question" : "experience", created_at: iso(NOW - (j + 1) * 3600_000) });
  fake.maxRows = 1000;
  const before = fake.requests.length;
  const o = await loadOverview(createServerSupabase(), { range: "7d", now: NOW });
  assert.equal(o.totals.postsTotal, 95 * 12);
  assert.equal(o.totals.posts.questions, 95 * 3);
  assert.equal(o.activeBusinesses, 95);
  assert.equal(fake.requests.slice(before).filter((r) => r.table === "reviews").length, 3, "95 businesses in chunks of 40: three reads");
});

test("if anything cannot be read, it fails, so the page can say so instead of showing zeros", async () => {
  seed();
  for (const table of ["sync_merchants", "sync_qr_codes", "sync_events", "reviews"]) {
    fake.failReadsFrom = table;
    await assert.rejects(() => loadOverview(createServerSupabase(), { range: "7d", now: NOW }), /./, table);
  }
  fake.failReadsFrom = null;
  assert.equal((await loadOverview(createServerSupabase(), { range: "7d", now: NOW })).totals.scans, 5);
});

test("a database with nothing in it gives an empty overview, not an error", async () => {
  const o = await loadOverview(createServerSupabase(), { range: "all", now: NOW });
  assert.equal(o.activeBusinesses, 0);
  assert.equal(o.totals.scans, 0);
});

// ---------- the sidebar ----------

test("the sidebar marks exactly one link as current, for every Sync address", () => {
  const cases = [
    ["/admin/sync", "/admin/sync"], ["/admin/sync/", "/admin/sync"], ["/admin/sync?range=30d", "/admin/sync"],
    ["/admin/sync/businesses", "/admin/sync/businesses"], ["/admin/sync/businesses/", "/admin/sync/businesses"],
    ["/admin/sync/11111111-1111-4111-8111-111111111111", "/admin/sync/businesses"],
    ["/admin/sync/new", "/admin/sync/new"], ["/admin/sync/new/", "/admin/sync/new"],
    ["/admin/sync/11111111-1111-4111-8111-111111111111/", "/admin/sync/businesses"],
    ["/admin", null], ["/", null], ["", null], [undefined, null], ["/admin/sync/a/b", null]
  ];
  for (const [path, expected] of cases) assert.equal(currentNav(path), expected, String(path));
  for (const path of ["/admin/sync", "/admin/sync/businesses", "/admin/sync/new", "/admin/sync/abc"]) assert.equal(SYNC_NAV.filter((i) => i.match(path)).length, 1, `${path}: more than one link would be marked`);
  assert.deepEqual(SYNC_NAV.map((i) => i.label), ["Overview", "Businesses", "Tag a business"]);
});

// ---------- guards on the screens ----------

const read = (file) => fs.readFileSync(file, "utf8");

test("the overview is admin-only, read fresh, and says so when it cannot load rather than showing zeros", () => {
  const page = read("app/admin/sync/page.js");
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.ok(page.indexOf("requireRole(ROLE.ADMIN)") < page.indexOf("loadOverview("), "the role is checked before anything is read");
  assert.match(page, /robots: NOINDEX_NOFOLLOW/);
  assert.match(page, /Could not load the overview\. Nothing below is shown/);
  assert.match(page, /const range = parseRange\(searchParams\?\.range\)/);
  assert.match(page, /data && data\.activeBusinesses > 0/, "the tiles only appear when there is something to count");
  assert.match(page, /Treat the totals as a minimum/);
  const parts = read("app/admin/sync/OverviewParts.js");
  assert.ok(!/dangerouslySetInnerHTML|lib\/supabase|createServerSupabase/.test(parts), "the display pieces read nothing and inject nothing");
});

test("the dark look is only on Sync, and only for an admin", () => {
  const layout = read("app/admin/sync/layout.js");
  assert.match(layout, /if \(!authResult\.ok\) return children;/, "anyone else gets the page's own plain message, with no sidebar");
  assert.match(layout, /IBM_Plex_Sans/);
  assert.match(layout, /IBM_Plex_Mono/);
  assert.match(layout, /import "\.\/sync-shell\.css"/);
  for (const file of ["app/layout.js", "app/admin/page.js"]) {
    assert.ok(!/sync-shell|IBM_Plex/.test(read(file)), `${file} must not load the Sync look`);
  }
});

test("every style in the Sync stylesheet is under .sync-shell, so no other page can change", () => {
  const css = read("app/admin/sync/sync-shell.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const flat = css.replace(/@media[^{]*\{([\s\S]*?\})\s*\}/g, "$1");
  const selectors = [...flat.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim()).flatMap((s) => s.split(","));
  assert.ok(selectors.length > 60, `${selectors.length} selectors`);
  for (const selector of selectors) assert.ok(selector.trim().startsWith(".sync-shell"), `a rule that could reach another page: ${selector}`);
  assert.ok(!/(^|[^.\w-])(html|body|:root)\b/.test(selectors.join(" ")), "nothing styles the whole page");
  assert.ok(!/!important/.test(css), "no !important");
});

test("the Sync pages that were there before still work inside the shell: their links point at the new list", () => {
  for (const [file, link] of [["app/admin/sync/new/NewMerchantClient.js", "Cancel"], ["app/admin/sync/[id]/MerchantEditorClient.js", "Back"], ["app/admin/sync/[id]/page.js", "Back to businesses"]]) {
    assert.match(read(file), new RegExp(`href="/admin/sync/businesses">${link}<`), `${file}`);
  }
  assert.match(read("app/admin/sync/businesses/page.js"), /href="\/admin\/sync">Overview</);
  assert.match(read("app/admin/page.js"), /href="\/admin\/sync"/, "the admin home still opens Sync, which is now the overview");
});

test("no <nav> element in the Sync screens: the site's stylesheet pins every <nav> to the top of the page", () => {
  const files = [];
  const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = `${dir}/${entry.name}`; if (entry.isDirectory()) walk(full); else if (/\.(js|css)$/.test(entry.name)) files.push(full); } };
  walk("app/admin/sync");
  assert.ok(files.length > 10);
  for (const file of files) {
    const code = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/<nav[\s>]/.test(code), `${file} uses a <nav> element`);
    if (file.endsWith(".css")) assert.ok(!/(^|[\s,}>+~])nav\b/.test(code), `${file} styles the nav element`);
  }
  assert.match(read("app/globals.css"), /^nav\{\s*position:fixed;top:0/m, "the reason, still true: if this changes, so can the guard");
  assert.match(read("app/admin/sync/SyncNav.js"), /role="navigation" aria-label="Sync"/);
  assert.match(read("app/admin/sync/OverviewParts.js"), /role="navigation" aria-label="Date range"/);
});

test("the chart's words are ordinary text, not text inside a picture that shrinks", () => {
  const parts = read("app/admin/sync/OverviewParts.js");
  const chart = parts.slice(parts.indexOf("export function ScansChart"), parts.indexOf("export function BusinessTable"));
  assert.ok(!/<text\b/.test(chart), "text inside the SVG would shrink with it");
  assert.match(chart, /className="ov-chart-meta"/);
  assert.match(chart, /className="ov-chart-axis"/);
  assert.match(chart, /role="img" aria-label=\{label\}/);
});
