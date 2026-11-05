// Patch 9: the pilot pack: CSV exports, the smoke test, and the runbook.
// Three things matter here. A spreadsheet must never be tricked into running something a person typed. A file
// must be whole or not made at all. And the checker that says "the site is healthy" must be able to say "it is not".

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { csvCell, toCsv, CSV_BOM, exportFilename, nepalDate, nepalDateTime } = await import("../lib/sync/csv.js");
const { buildExport, EXPORT_KINDS } = await import("../lib/sync/exports.js");
const { GET: exportRoute } = await import("../app/api/admin/sync/export/route.js");
const { loadOverview, RANGES } = await import("../lib/sync/overview.js");
const { runSmoke, SMOKE_UA } = await import("../lib/sync/smoke.mjs");
const { createServerSupabase } = await import("../lib/supabase/server.js");
const { isBot } = await import("../lib/sync/qr.js");

const fake = new FakePostgrest();
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SITE_URL"];
const saved = {};
let savedConsoleError;
let logged = [];
before(async () => {
  await fake.listen();
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.kastochhanepal.com/";
  savedConsoleError = console.error;
});
after(async () => {
  console.error = savedConsoleError;
  for (const key of ENV_KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  await fake.close();
});
const as = (role) => { globalThis.__KC_TEST__ = { userId: role ? "user_admin" : null, roles: role ? { user_admin: role } : {}, cookies: {} }; };
beforeEach(() => { fake.reset(); logged = []; console.error = (...a) => logged.push(a.map(String).join(" ")); as("admin"); });

// A small, strict CSV reader for the tests: quotes, doubled quotes, commas and line breaks inside cells.
function parseCsv(text) {
  const body = text.replace(/^\uFEFF/, "");
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (quoted) { if (c === '"' && body[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r" && body[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i += 1; }
    else cell += c;
  }
  assert.equal(cell, "", "a file ends with a line break"); assert.equal(row.length, 0);
  return rows;
}
const table = (text) => { const [head, ...rows] = parseCsv(text); return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))); };

// ---------- the CSV writer ----------

test("a cell that a spreadsheet would run as a formula is made harmless", () => {
  for (const text of ["=1+1", "+1", "-1", "@SUM(A1)", "=HYPERLINK(\"http://x\",\"y\")", " =1+1", "\t=1", "\r=1", "  @x", "-Himal Cafe"]) {
    const cell = csvCell(text);
    assert.ok(cell.replace(/^"/, "").startsWith("'"), JSON.stringify([text, cell]));
  }
  assert.equal(csvCell('=HYPERLINK("http://x","y")'), '"\'=HYPERLINK(""http://x"",""y"")"', "guarded, then quoted, with quotes doubled");
  assert.equal(csvCell("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
});

test("only text is guarded: numbers, including negative ones, are numbers, and ordinary text is untouched", () => {
  assert.equal(csvCell(-5), "-5");
  assert.equal(csvCell(0), "0");
  assert.equal(csvCell(12.5), "12.5");
  assert.equal(csvCell("Himal Brew House"), "Himal Brew House");
  assert.equal(csvCell("a=b"), "a=b", "an equals sign that does not begin the cell is harmless");
  assert.equal(csvCell("\u0939\u093f\u092e\u093e\u0932 \u0915\u093e\u092b\u0947"), "\u0939\u093f\u092e\u093e\u0932 \u0915\u093e\u092b\u0947", "Nepali is kept as it is");
});

test("empty, boolean, date and odd values are written plainly", () => {
  assert.equal(csvCell(null), ""); assert.equal(csvCell(undefined), "");
  assert.equal(csvCell(true), "yes"); assert.equal(csvCell(false), "no");
  assert.equal(csvCell(NaN), ""); assert.equal(csvCell(Infinity), "");
  assert.equal(csvCell(new Date("2026-11-04T09:30:00Z")), "2026-11-04T09:30:00.000Z");
  assert.equal(csvCell(new Date("nope")), "");
});

test("a cell with a comma, a quote or a line break is quoted, and its quotes are doubled", () => {
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("one\ntwo"), '"one\ntwo"');
  assert.equal(csvCell("one\r\ntwo"), '"one\r\ntwo"');
  assert.equal(csvCell("plain"), "plain");
});

test("a table ends every row with CRLF, reads back exactly, and a ragged row is a bug that stops it", () => {
  const text = toCsv(["Name", "Note"], [["Himal, Jhamsikhel", 'a "b"'], ["=bad", 3], ["", null]]);
  assert.equal(text, 'Name,Note\r\n"Himal, Jhamsikhel","a ""b"""\r\n\'=bad,3\r\n,\r\n');
  assert.deepEqual(parseCsv(text), [["Name", "Note"], ["Himal, Jhamsikhel", 'a "b"'], ["'=bad", "3"], ["", ""]]);
  assert.throws(() => toCsv(["a", "b"], [["only one"]]), /expected 2/);
  assert.equal(toCsv(["a"], []), "a\r\n");
  assert.equal(CSV_BOM, "\uFEFF");
});

test("a file is named for what it is and the Nepal day, which turns over at 18:15 UTC", () => {
  const before = Date.UTC(2026, 10, 4, 18, 14, 59), after = Date.UTC(2026, 10, 4, 18, 15, 0);
  assert.equal(exportFilename("businesses", "", before), "kastochha-sync-businesses-2026-11-04.csv");
  assert.equal(exportFilename("businesses", "", after), "kastochha-sync-businesses-2026-11-05.csv");
  assert.equal(exportFilename("activity", "30d", after), "kastochha-sync-activity-30d-2026-11-05.csv");
  assert.equal(nepalDate("2026-11-04T18:30:00Z"), "2026-11-05");
  assert.equal(nepalDateTime("2026-11-04T12:00:00Z"), "2026-11-04 17:45");
  assert.equal(nepalDate("nope"), ""); assert.equal(nepalDateTime(""), "");
});

// ---------- the exports ----------

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", C = "33333333-3333-4333-8333-333333333333";
const QA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", QA2 = "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa", QB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", QC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = Date.now(), DAY = 86400000, iso = (ms) => new Date(ms).toISOString();
function seed() {
  const m = (o) => fake.tables.sync_merchants.push({ business_kind: "cafe", kind_label: null, category: "Food", about: "", status: "active", created_at: iso(NOW - 60 * DAY), google_review_url: null, google_maps_url: null, owner_user_id: null, ...o });
  m({ id: A, slug: "himal-brew-house", topic_slug: "himal-x", business_name: "Himal Brew House", area: "Jhamsikhel", google_review_url: "https://g.page/r/abc/review", google_maps_url: "https://maps.app.goo.gl/abc", owner_user_id: "user_owner_SECRET_a" });
  m({ id: B, slug: "momo-hub", topic_slug: "momo-x", business_name: "Momo Hub", area: "Pulchowk", business_kind: "restaurant" });
  m({ id: C, slug: "gone-cafe", topic_slug: "gone-x", business_name: "Gone Cafe", area: "X", status: "cancelled", owner_user_id: "user_owner_SECRET_c" });
  const q = (id, merchant_id, code, label, active = true) => fake.tables.sync_qr_codes.push({ id, merchant_id, code, label, active, created_at: iso(NOW - 50 * DAY) });
  q(QA, A, "abc3k9xq", "Counter"); q(QA2, A, "abc3k9x2", "Table 1", false); q(QB, B, "zzzzzzzz", "Door"); q(QC, C, "cccccccc", "Old");
  const e = (merchant_id, qr_code_id, event_type, ago) => fake.tables.sync_events.push({ merchant_id, qr_code_id, event_type, created_at: iso(NOW - ago) });
  for (const ago of [DAY, 2 * DAY, 3 * DAY]) e(A, QA, "scan", ago);
  e(A, QA, "scan", 20 * DAY);
  e(A, null, "hub_share", DAY); e(A, null, "hub_share", DAY); e(A, QA, "hub_ask", DAY); e(A, null, "google_copy", DAY);
  e(A, null, "badge_open", DAY); e(A, null, "badge_open", 2 * DAY);
  e(B, QB, "scan", 40 * DAY); e(C, QC, "scan", 5 * DAY);
  const p = (slug, kind, source, ago) => fake.tables.reviews.push({ id: `p${fake.tables.reviews.length}`, topic: slug, title: slug, topic_slug: slug, category: "Food", kind, summary: "x", verdict: kind === "question" ? null : "Ramro chha", author_name: "A", user_id: "u", source, created_at: iso(NOW - ago) });
  p("himal-x", "experience", "qr", DAY); p("himal-x", "experience", null, 2 * DAY); p("himal-x", "question", null, DAY);
  fake.tables.sync_owner_replies.push({ id: "r1", merchant_id: A, review_id: "p0", author_user_id: "user_owner_SECRET_a", body: "A SECRET REPLY", created_at: iso(NOW - DAY), edited_at: null });
  const n = (merchant_id, ago, message, contact) => fake.tables.sync_feedback.push({ id: `n${fake.tables.sync_feedback.length}`, merchant_id, message, contact, is_urgent: false, status: "new", created_at: iso(NOW - ago), handled_at: null });
  n(A, DAY, "SECRET NOTE WORDS", "98-SECRET-CONTACT"); n(A, 10 * DAY, "an older note", null); n(B, DAY, "another", null);
}
const build = (kind, o = {}) => buildExport(createServerSupabase(), kind, { now: NOW, ...o });

test("the businesses file has every business ever tagged, with what is set up for it, and nothing private", async () => {
  seed();
  const out = await build("businesses");
  assert.deepEqual(parseCsv(out.text)[0], ["Business", "Area", "Type", "Status", "Hub address", "Business page address", "QR cards", "QR cards switched on", "Google review link", "Google Maps link", "Owner linked", "Tagged on"]);
  const rows = table(out.text);
  assert.deepEqual(rows.map((r) => r.Business), ["Himal Brew House", "Momo Hub", "Gone Cafe"], "including the one whose tag was removed");
  const himal = rows[0];
  assert.deepEqual({ type: himal.Type, status: himal.Status, hub: himal["Hub address"], page: himal["Business page address"], cards: himal["QR cards"], on: himal["QR cards switched on"], review: himal["Google review link"], maps: himal["Google Maps link"], owner: himal["Owner linked"], tagged: himal["Tagged on"] }, { type: "Cafe", status: "active", hub: "https://www.kastochhanepal.com/hub/himal-brew-house", page: "https://www.kastochhanepal.com/discussions/himal-x", cards: "2", on: "1", review: "yes", maps: "yes", owner: "yes", tagged: nepalDate(iso(NOW - 60 * DAY)) });
  assert.deepEqual([rows[1]["Google review link"], rows[1]["Owner linked"], rows[1].Type], ["no", "no", "Restaurant"]);
  assert.equal(rows[2].Status, "cancelled");
  assert.ok(!/user_owner|SECRET|g\.page|maps\.app/.test(out.text), "a yes or a no: never the link, never the account");
  assert.equal(out.kind, "businesses");
});

test("the QR cards file counts only scans, per card, with the last one, in Nepal time", async () => {
  seed();
  const rows = table((await build("qr-codes")).text);
  const by = Object.fromEntries(rows.map((r) => [r["Card label"], r]));
  assert.equal(rows.length, 4);
  assert.deepEqual([by.Counter["Scans (all time)"], by.Counter["Card switched on"], by.Counter["Scan address"]], ["4", "yes", "https://www.kastochhanepal.com/q/abc3k9xq"], "taps and badge events are not scans");
  assert.equal(by.Counter["Last scan (Nepal time)"], nepalDateTime(iso(NOW - DAY)));
  assert.deepEqual([by["Table 1"]["Scans (all time)"], by["Table 1"]["Card switched on"], by["Table 1"]["Last scan (Nepal time)"]], ["0", "no", ""]);
  assert.deepEqual([by.Old["Business status"], by.Old["Scans (all time)"]], ["cancelled", "1"], "a removed business's card is still listed");
  assert.deepEqual(rows.map((r) => r.Business), ["Gone Cafe", "Himal Brew House", "Himal Brew House", "Momo Hub"], "by business");
});

test("the activity report is the Overview's own numbers, plus replies and notes, for active businesses, by name", async () => {
  seed();
  const out = await build("activity", { range: "7d" });
  const rows = table(out.text);
  assert.deepEqual(rows.map((r) => r.Business), ["Himal Brew House", "Momo Hub"], "active only, alphabetical");
  const overview = await loadOverview(createServerSupabase(), { range: "7d", now: NOW });
  for (const r of rows) {
    const o = overview.rows.find((x) => x.name === r.Business);
    assert.deepEqual([r["QR scans"], r["Hub taps"], r["Website badge opens"], r["Website badge clicks"], r.Experiences, r.Questions, r["Visited posts"], r["QR cards switched on"], r.Status, r.Range], [o.scans, o.taps, o.badgeOpens, o.badgeClicks, o.experiences, o.questions, o.visited, o.activeCodes, o.status.label, "Last 7 days"].map(String), r.Business);
  }
  const himal = rows[0];
  assert.deepEqual([himal["QR scans"], himal["Hub taps"], himal["Website badge opens"], himal.Experiences, himal.Questions, himal["Visited posts"], himal["Business replies"], himal["Private notes"]], ["3", "4", "2", "2", "1", "1", "1", "1"], "the 10-day-old note and the 20-day-old scan are outside a week");
  assert.equal(out.suffix, "7d");
});

test("a longer range counts more, and 'all time' counts everything", async () => {
  seed();
  const row = async (range) => table((await build("activity", { range })).text)[0];
  assert.deepEqual([(await row("30d"))["QR scans"], (await row("30d"))["Private notes"]], ["4", "2"]);
  const all = await row("all");
  assert.deepEqual([all["QR scans"], all["Private notes"], all.Range], ["4", "2", "All time"]);
  assert.deepEqual([...Array(3)].map(() => "x").length, 3);
  for (const r of RANGES) assert.ok((await build("activity", { range: r })).text.length > 50);
});

test("names a person typed cannot run in a spreadsheet, and survive commas, quotes and line breaks", async () => {
  seed();
  Object.assign(fake.tables.sync_merchants[0], { business_name: "=HYPERLINK(\"http://evil\",\"click\")", area: "+1 area, \"north\"\nside" });
  Object.assign(fake.tables.sync_merchants[1], { business_name: "@SUM(A1:A9)", area: "-Pulchowk" });
  for (const kind of EXPORT_KINDS) {
    const rows = parseCsv((await build(kind, { range: "all" })).text);
    for (const cell of rows.flat()) assert.ok(!/^\s*[=+\-@]/.test(cell) || /^-?\d+(\.\d+)?$/.test(cell), `${kind}: ${JSON.stringify(cell)} would run as a formula`);
  }
  const businesses = table((await build("businesses")).text);
  assert.equal(businesses[0].Business, "'=HYPERLINK(\"http://evil\",\"click\")");
  assert.equal(businesses[0].Area, "'+1 area, \"north\"\nside", "the guard, the comma, the quotes and the line break all survive");
});

test("no file contains a private note's words, a contact, a reply's words, an account id or an email", async () => {
  seed();
  for (const kind of EXPORT_KINDS) {
    const text = (await build(kind, { range: "all" })).text;
    assert.ok(!/SECRET|user_|98-|@.*\./.test(text.replace(/https:\/\/www\.kastochhanepal\.com[^,\r\n]*/g, "")), `${kind}: ${text.slice(0, 200)}`);
  }
});

test("counts are exact past the server's 1,000-row cap", async () => {
  seed();
  fake.maxRows = 1000;
  for (let i = 0; i < 2300; i += 1) fake.tables.sync_events.push({ merchant_id: A, qr_code_id: QA, event_type: "scan", created_at: iso(NOW - 1000 - i) });
  const card = table((await build("qr-codes")).text).find((r) => r["Card label"] === "Counter");
  assert.equal(card["Scans (all time)"], String(4 + 2300), "a count of one page of rows would have said 1,000");
  assert.equal(table((await build("activity", { range: "7d" })).text)[0]["QR scans"], String(3 + 2300));
});

test("data that cannot be read in full is refused, never exported short", async () => {
  const endless = { from: () => { const chain = { select: () => chain, order: () => chain, eq: () => chain, gte: () => chain, in: () => chain, range: async () => ({ data: Array.from({ length: 1000 }, (_, i) => ({ id: String(i), merchant_id: "m", qr_code_id: "q", created_at: "2026-01-01T00:00:00Z", business_name: "x", area: "x", slug: "x", topic_slug: "x", status: "active", label: "x", code: "x", active: true })), error: null }) }; return chain; } };
  for (const kind of ["businesses", "qr-codes"]) await assert.rejects(() => buildExport(endless, kind, { now: NOW }), (e) => e.expected === true && /too much data/i.test(e.message), kind);
});

test("an unknown kind is refused", async () => {
  await assert.rejects(() => build("notes"), /Unknown export/);
  assert.deepEqual(EXPORT_KINDS, ["businesses", "qr-codes", "activity"], "private notes are not an export");
});

// ---------- the download route ----------

const get = (query) => exportRoute(new Request(`https://www.kastochhanepal.com/api/admin/sync/export${query}`));

test("only an admin can download, and a visitor learns nothing", async () => {
  seed();
  for (const role of [null, "user"]) {
    as(role);
    const res = await get("?kind=businesses");
    assert.equal(res.status, role ? 403 : 401);
    assert.ok(!(await res.text()).includes("Himal"));
  }
});

test("a download is a CSV attachment, never cached, with a byte-order mark and the right name", async () => {
  seed();
  const res = await get("?kind=businesses");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(res.headers.get("content-disposition"), /^attachment; filename="kastochha-sync-businesses-\d{4}-\d{2}-\d{2}\.csv"$/);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("set-cookie"), null);
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "UTF-8 byte-order mark, so Excel shows Nepali correctly");
  assert.ok(new TextDecoder().decode(bytes).includes("\r\n"));
});

test("each kind downloads, the activity range is in its name, and a missing range is 30 days", async () => {
  seed();
  for (const kind of EXPORT_KINDS) assert.equal((await get(`?kind=${kind}`)).status, 200, kind);
  assert.match((await get("?kind=activity&range=7d")).headers.get("content-disposition"), /activity-7d-/);
  assert.match((await get("?kind=activity")).headers.get("content-disposition"), /activity-30d-/);
  assert.match((await get("?kind=activity&range=all")).headers.get("content-disposition"), /activity-all-/);
  const odd = (await get("?kind=activity&range=banana")).headers.get("content-disposition");
  assert.ok(RANGES.some((r) => odd.includes(`activity-${r}-`)), "an unknown range becomes a real one");
  assert.match((await get("?kind=qr-codes&range=7d")).headers.get("content-disposition"), /qr-codes-\d{4}/, "a range means nothing to a file that has none");
});

test("a bad or missing kind is refused with the choices", async () => {
  for (const q of ["", "?kind=", "?kind=notes", "?kind=BUSINESSES", "?kind=businesses,qr-codes", "?kind=../x"]) {
    const res = await get(q);
    assert.equal(res.status, 400, q);
    assert.match((await res.json()).error, /businesses, qr-codes or activity/);
  }
});

// Which tables each file is built from. A file whose table cannot be read must fail, and one that does not use
// that table must still come out whole.
const NEEDS = {
  businesses: ["sync_merchants", "sync_qr_codes"],
  "qr-codes": ["sync_merchants", "sync_qr_codes", "sync_events"],
  activity: ["sync_merchants", "sync_qr_codes", "sync_events", "reviews", "sync_owner_replies", "sync_feedback"]
};

test("a failed read is an error and no file: never a short file that looks whole", async () => {
  seed();
  for (const failing of ["sync_merchants", "sync_qr_codes", "sync_events", "reviews", "sync_owner_replies", "sync_feedback"]) {
    for (const kind of EXPORT_KINDS) {
      fake.failReadsFrom = failing;
      const res = await get(`?kind=${kind}&range=all`);
      if (!NEEDS[kind].includes(failing)) { assert.equal(res.status, 200, `${kind} does not use ${failing}, so it is unaffected`); continue; }
      assert.equal(res.status, 500, `${kind} with ${failing} down`);
      const body = await res.json();
      assert.match(body.error, /Nothing was downloaded/);
      assert.ok(!/simulated|XX000/.test(JSON.stringify(body)), "the database's words are not passed on");
      assert.equal(res.headers.get("content-disposition"), null, "no file");
    }
  }
  assert.ok(logged.length > 0, "and the failure is logged for the team");
});

// ---------- the smoke test ----------

const SLUG = "himal-brew-house", CODE = "abc3k9xq", TOPIC = "himal-brew-house-jhamsikhel";
const NOINDEX = '<meta name="robots" content="noindex, nofollow"/>';
function healthy(over = {}) {
  const calls = [];
  const routes = {
    "GET /robots.txt": () => new Response("User-agent: *\nDisallow: /hub/\nDisallow: /q/\n"),
    [`GET /q/${CODE}`]: (init) => { const h = new Headers({ location: `/hub/${SLUG}?c=${CODE}`, "cache-control": "no-store" }); if (!/bot/i.test(init.headers["user-agent"])) { h.append("set-cookie", `kc_v_${SLUG}=tok; Path=/; HttpOnly`); h.append("set-cookie", `kc_q=${CODE}; Path=/`); } return new Response(null, { status: 302, headers: h }); },
    [`GET /hub/${SLUG}`]: () => new Response(`<html><head>${NOINDEX}</head><body>Share your experience Ask a question Send a private note <a href="/discussions/${TOPIC}#share">Share</a></body></html>`),
    [`GET /hub/${SLUG}/note`]: () => new Response(`<html><head>${NOINDEX}</head><body>It is never posted.</body></html>`),
    [`GET /discussions/${TOPIC}`]: () => new Response("<html><body>Himal Brew House Ask a question</body></html>"),
    [`GET /api/badge/check?business=${SLUG}`]: () => new Response('{"allowed":true}', { headers: { "access-control-allow-origin": "*", "content-type": "application/json" } }),
    "GET /badge-widget.js": () => new Response("(function(){})()", { headers: { "content-type": "application/javascript; charset=utf-8" } }),
    "POST /api/reviews": () => new Response('{"error":"Unauthorized"}', { status: 401 }),
    "POST /api/sync/owner-replies": () => new Response('{"error":"Sign in to reply."}', { status: 401 }),
    "GET /admin/sync": () => new Response("<html><h1>Admin access required</h1></html>"),
    "GET /api/admin/sync/export?kind=businesses": () => new Response('{"error":"Unauthorized"}', { status: 401 }),
    "POST /api/sync/feedback": (init) => { const b = JSON.parse(init.body); return b.note === "" ? new Response('{"error":"Write your note first."}', { status: 400 }) : new Response('{"ok":true}', { status: 201 }); },
    ...over
  };
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url); const key = `${init.method || "GET"} ${u.pathname}${u.search}`;
    calls.push({ key, body: init.body ? JSON.parse(init.body) : undefined, ua: init.headers?.["user-agent"] });
    const handler = routes[key];
    if (!handler) return new Response("not found", { status: 404 });
    const res = handler(init); return res;
  };
  return { fetchImpl, calls };
}
const smoke = (site, o = {}) => runSmoke({ base: "https://site.example/", slug: SLUG, code: CODE, fetchImpl: site.fetchImpl, ...o });
const failing = (r) => r.results.filter((x) => !x.ok).map((x) => x.name);

test("on a healthy site every check passes, and by default nothing is written or counted", async () => {
  const site = healthy(); const r = await smoke(site);
  assert.equal(r.failed, 0, JSON.stringify(failing(r)));
  assert.equal(r.results.length, 14);
  assert.ok(site.calls.every((c) => c.ua === SMOKE_UA), "it always identifies itself the same way");
  assert.equal(isBot(SMOKE_UA), true, "and the site's own bot detector recognises that name, so nothing it does is ever counted as a scan");
  const posts = site.calls.filter((c) => c.key.startsWith("POST"));
  assert.deepEqual(posts.map((c) => c.key), ["POST /api/reviews", "POST /api/sync/owner-replies", "POST /api/sync/feedback", "POST /api/sync/feedback"]);
  assert.ok(posts.every((c) => !c.body || c.body.note === "" || c.body.website || c.key !== "POST /api/sync/feedback"), "the only note-route requests are an empty one and a spam-trap one: neither stores anything");
  assert.ok(site.calls.every((c) => !c.key.startsWith("GET /q/") || c.key === `GET /q/${CODE}`) && site.calls.filter((c) => c.key.startsWith("GET /q/")).length === 1);
});

const BREAKS = [
  ["robots.txt lets the hub be indexed", { "GET /robots.txt": () => new Response("User-agent: *\nDisallow: /admin/\n") }, "robots.txt keeps"],
  ["a scan link is a permanent redirect", { [`GET /q/${CODE}`]: () => new Response(null, { status: 301, headers: { location: `/hub/${SLUG}?c=${CODE}` } }) }, "a scan link goes"],
  ["a scan link can be cached", { [`GET /q/${CODE}`]: () => new Response(null, { status: 302, headers: { location: `/hub/${SLUG}?c=${CODE}` } }) }, "a scan link goes"],
  ["a scan link goes to the wrong place", { [`GET /q/${CODE}`]: () => new Response(null, { status: 302, headers: { location: "/", "cache-control": "no-store" } }) }, "a scan link goes"],
  ["a bot is given a cookie", { [`GET /q/${CODE}`]: () => { const h = new Headers({ location: `/hub/${SLUG}?c=${CODE}`, "cache-control": "no-store" }); h.append("set-cookie", "kc_q=1"); return new Response(null, { status: 302, headers: h }); } }, "a scan link goes"],
  ["the hub is not found", { [`GET /hub/${SLUG}`]: () => new Response("no", { status: 404 }) }, "the hub opens"],
  ["the hub can be indexed", { [`GET /hub/${SLUG}`]: () => new Response(`<html>Share your experience Ask a question Send a private note <a href="/discussions/${TOPIC}#share">x</a></html>`) }, "the hub opens"],
  ["the hub has lost the private note option", { [`GET /hub/${SLUG}`]: () => new Response(`<html><head>${NOINDEX}</head>Share your experience Ask a question <a href="/discussions/${TOPIC}#share">x</a></html>`) }, "the hub opens"],
  ["the note page can be indexed", { [`GET /hub/${SLUG}/note`]: () => new Response("<html>It is never posted.</html>") }, "the private note page"],
  ["the note page no longer says it is private", { [`GET /hub/${SLUG}/note`]: () => new Response(`<html><head>${NOINDEX}</head>hello</html>`) }, "the private note page"],
  ["the business page has no Ask box", { [`GET /discussions/${TOPIC}`]: () => new Response("<html>Himal Brew House</html>") }, "the business's own page"],
  ["a page carries a secret key", { [`GET /hub/${SLUG}/note`]: () => new Response(`<html><head>${NOINDEX}</head>It is never posted. sk_live_abcdefghijklmnop12345</html>`) }, "no page carries a secret"],
  ["a page names the hub secret", { [`GET /discussions/${TOPIC}`]: () => new Response("<html>Ask a question SYNC_HUB_SECRET=abc</html>") }, "no page carries a secret"],
  ["the badge says no for an active business", { [`GET /api/badge/check?business=${SLUG}`]: () => new Response('{"allowed":false}', { headers: { "access-control-allow-origin": "*" } }) }, "the website badge answers"],
  ["the badge is closed to other websites", { [`GET /api/badge/check?business=${SLUG}`]: () => new Response('{"allowed":true}') }, "the website badge answers"],
  ["the badge answers with something that is not JSON", { [`GET /api/badge/check?business=${SLUG}`]: () => new Response("<html>oops</html>", { headers: { "access-control-allow-origin": "*" } }) }, "the website badge answers"],
  ["the badge script is served as a web page", { "GET /badge-widget.js": () => new Response("x", { headers: { "content-type": "text/html" } }) }, "the badge script"],
  ["posting is open to anyone", { "POST /api/reviews": () => new Response("{}", { status: 200 }) }, "posting still needs"],
  ["replying as a business is open to anyone", { "POST /api/sync/owner-replies": () => new Response("{}", { status: 201 }) }, "replying as a business"],
  ["the team dashboard is served to a visitor", { "GET /admin/sync": () => new Response('<div class="sync-side">Overview Feedback inbox</div>') }, "the team pages"],
  ["an export is served to a visitor", { "GET /api/admin/sync/export?kind=businesses": () => new Response("\uFEFFBusiness,Area\r\nHimal,x\r\n") }, "the exports"],
  ["an empty note is accepted", { "POST /api/sync/feedback": () => new Response('{"ok":true}', { status: 201 }) }, "a private note route"],
  ["the spam trap breaks the route", { "POST /api/sync/feedback": (init) => (JSON.parse(init.body).note === "" ? new Response("{}", { status: 400 }) : new Response("boom", { status: 500 })) }, "a spam program"]
];
for (const [what, override, name] of BREAKS) {
  test(`the smoke test notices: ${what}`, async () => {
    const r = await smoke(healthy(override));
    const f = failing(r);
    assert.ok(f.some((n) => n.startsWith(name)), `expected a failure starting "${name}", got ${JSON.stringify(f)}`);
    assert.ok(r.failed >= 1 && r.failed <= 2, `a single fault should fail one check (two when another depends on it): ${JSON.stringify(f)}`);
    assert.ok(r.results.find((x) => !x.ok).detail.length > 0, "and it says why");
  });
}

test("if the site cannot be reached every check fails, plainly, and nothing throws", async () => {
  const r = await smoke({ fetchImpl: async () => { throw new TypeError("fetch failed: ECONNREFUSED"); } });
  assert.equal(r.failed, r.results.length, "not one check passes");
  assert.ok(r.results.filter((x) => /could not be reached: .*ECONNREFUSED/.test(x.detail)).length >= 12, "the ones that make a request say they could not be reached");
  assert.ok(r.results.every((x) => x.detail.length > 0), "and every one says why");
});

test("a site that never answers is a failure after the timeout, not a hang", async () => {
  const hang = async (_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  const started = Date.now();
  const r = await smoke({ fetchImpl: hang }, { timeoutMs: 25 });
  assert.ok(Date.now() - started < 4000);
  assert.equal(r.failed, r.results.length);
  assert.ok(r.results.filter((x) => /timed out/.test(x.detail)).length >= 12, "the ones that make a request say they timed out");
});

test("--count-scan makes one real scan and reports whether Visited labels are on; a missing scan cookie fails", async () => {
  const site = healthy(); const r = await smoke(site, { countScan: true });
  assert.equal(r.failed, 0, JSON.stringify(failing(r)));
  assert.ok(r.results.some((x) => /^info: Visited labels are ON/.test(x.name) && x.info === true));
  assert.equal(r.checks, 15, "information is shown but is not counted as a check");
  assert.equal(r.results.length, 16);
  const scans = site.calls.filter((c) => c.key === `GET /q/${CODE}`);
  assert.equal(scans.length, 2);
  assert.ok(/iPhone/.test(scans[1].ua), "the real scan looks like a phone, so it is counted");
  const noSecret = await smoke(healthy({ [`GET /q/${CODE}`]: (init) => { const h = new Headers({ location: `/hub/${SLUG}?c=${CODE}`, "cache-control": "no-store" }); if (!/bot/i.test(init.headers["user-agent"])) h.append("set-cookie", `kc_q=${CODE}`); return new Response(null, { status: 302, headers: h }); } }), { countScan: true });
  assert.equal(noSecret.failed, 0);
  assert.ok(noSecret.results.some((x) => /^info: Visited labels are OFF.*SYNC_HUB_SECRET/.test(x.name)));
  const broken = await smoke(healthy({ [`GET /q/${CODE}`]: (init) => new Response(null, { status: 302, headers: { location: `/hub/${SLUG}?c=${CODE}`, "cache-control": "no-store" } }) }), { countScan: true });
  assert.ok(failing(broken).some((n) => n.startsWith("a real scan")), "a phone given no scan cookie is a failure");
});

test("--write sends exactly one real note, marked as a test; nothing else is different", async () => {
  const plain = healthy(); await smoke(plain);
  const site = healthy(); const r = await smoke(site, { write: true });
  assert.equal(r.failed, 0, JSON.stringify(failing(r)));
  const real = site.calls.filter((c) => c.body && c.body.note && c.body.note !== "" && !c.body.website);
  assert.equal(real.length, 1);
  assert.match(real[0].body.note, /^SMOKE TEST: please ignore and resolve/);
  assert.equal(plain.calls.filter((c) => c.body?.note && !c.body.website).length, 0, "without the switch, no real note");
});

test("the command refuses to start without what it needs, and exits 1 when the site is down", () => {
  const run = (...args) => spawnSync(process.execPath, ["scripts/sync-smoke.mjs", ...args], { encoding: "utf8", timeout: 60000 });
  for (const args of [[], ["--base", "https://x.example"], ["--base", "ftp://x.example", "--slug", "a", "--code", "b"], ["--slug", "a", "--code", "b"]]) {
    const r = run(...args);
    assert.equal(r.status, 2, JSON.stringify(args));
    assert.match(r.stderr, /Usage: node scripts\/sync-smoke\.mjs/);
  }
  const down = run("--base", "http://127.0.0.1:9", "--slug", "a", "--code", "b");
  assert.equal(down.status, 1);
  assert.match(down.stdout, /FAIL {2}robots\.txt/);
  assert.match(down.stdout, /0 passed, 14 failed\. Do not go live/);
  assert.match(down.stdout, /Do not go live until these are fixed\./);
});

// ---------- the screen, the sidebar, and the runbook ----------

const read = (f) => fs.readFileSync(f, "utf8");

test("the export page is admin-only, offers each file, and says what is not in them", () => {
  const page = read("app/admin/sync/export/page.js");
  assert.match(page, /robots: NOINDEX_NOFOLLOW/);
  assert.ok(page.indexOf("requireRole(ROLE.ADMIN)") < page.indexOf("FILES.map"));
  for (const href of ["?kind=businesses", "?kind=qr-codes", "?kind=activity&range=7d", "?kind=activity&range=30d", "?kind=activity&range=all"]) assert.ok(page.includes(`/api/admin/sync/export${href}`), href);
  assert.match(page, /Private notes are not in any file/);
  assert.ok(!/<nav[\s>]/.test(page));
});

test("the export route checks the role before it reads anything", () => {
  const route = read("app/api/admin/sync/export/route.js");
  assert.ok(route.indexOf("requireRole(ROLE.ADMIN)") < route.indexOf("buildExport("));
  assert.match(route, /"Cache-Control": "no-store"/);
});

test("the runbook names every migration in order, every setting that exists, and every screen that exists", () => {
  const book = read("docs/sync/runbook.md");
  const migrations = fs.readdirSync("supabase/migrations").filter((f) => /^00(1[89]|2\d)_/.test(f)).sort();
  assert.ok(migrations.length >= 6);
  let at = -1;
  for (const file of migrations) { const i = book.indexOf(file); assert.ok(i > at, `${file} is missing from the runbook or out of order`); at = i; }
  const env = read(".env.example");
  for (const name of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "SYNC_HUB_SECRET"]) {
    assert.ok(book.includes(`\`${name}\``), `${name} is not in the runbook`);
    assert.ok(env.includes(name), `${name} is not a setting this repo knows`);
  }
  for (const [, path] of book.matchAll(/`?(\/admin\/sync\/(?:feedback|export|businesses|new))`?/g)) assert.ok(fs.existsSync(`app${path}/page.js`), path);
});

test("the runbook's commands match the real ones", () => {
  const book = read("docs/sync/runbook.md");
  const script = read("scripts/sync-smoke.mjs");
  assert.match(book, /node scripts\/sync-smoke\.mjs --base https:\/\/www\.kastochhanepal\.com --slug <test-cafe> --code <its-code>/);
  for (const flag of ["--count-scan", "--write", "--base", "--slug", "--code"]) { assert.ok(book.includes(flag), `${flag} not in the runbook`); assert.ok(script.includes(flag), `${flag} not in the script`); }
  const sql = read("supabase/migrations/0018_sync_foundation.sql");
  assert.ok(/sync_feedback/.test(book) && /handled_at/.test(sql) && /status in \('new', 'in_digest', 'resolved'\)/.test(sql), "the retention SQL names real columns and a real status");
  assert.match(book, /select pg_get_constraintdef\(oid\) from pg_constraint where conname = 'sync_events_type_check'/);
  assert.match(read("supabase/migrations/0022_sync_badge_events.sql"), /sync_events_type_check/);
  assert.match(book, /public posts are never removed on request/i);
});

test("the smoke module is plain ES and imports nothing, so it runs anywhere with Node", () => {
  const src = read("lib/sync/smoke.mjs");
  assert.ok(!/^\s*import\s/m.test(src), "no imports");
  assert.ok(!/process\.env/.test(src), "it never reads this machine's secrets");
});
