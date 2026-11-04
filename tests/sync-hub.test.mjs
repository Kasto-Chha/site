// The hub: the scan route, the tap route, the admin's QR routes, and what the hub offers.
// Run against the real route code with a fake database, a fake sign-in and a fake rate limiter.

process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import sharp from "sharp";
import jsQR from "jsqr";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { GET: scanRoute } = await import("../app/q/[code]/route.js");
const { POST: tapRoute } = await import("../app/api/sync/event/route.js");
const { POST: createRoute } = await import("../app/api/admin/sync/merchants/[id]/qr/route.js");
const { PUT: updateRoute } = await import("../app/api/admin/sync/qr/[qrId]/route.js");
const { GET: downloadRoute } = await import("../app/api/admin/sync/qr/[qrId]/download/route.js");
const { createQrCode, findQrByCode, logHubEvent, listQrCodes, EVENT_TYPES, HUB_CLICK_EVENTS, MAX_CODES_PER_BUSINESS, SCAN_COOKIE } = await import("../lib/sync/qr.js");
const { hubActions, hubFacts } = await import("../lib/sync/hub.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");
const { PAGE_A5 } = await import("../lib/sync/pdf.js");

const fake = new FakePostgrest();
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SITE_URL"];
const saved = {};
let savedConsoleError;

before(async () => {
  await fake.listen();
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.kastochhanepal.com";
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

function world({ role = null, userId = "user_a", upstash = "on" } = {}) {
  globalThis.__KC_TEST__ = { userId: role ? userId : null, roles: role ? { [userId]: role } : {}, cookies: {}, revalidatedPaths: [], upstash, redis: {}, seenIdentifiers: [] };
}

beforeEach(() => {
  fake.reset();
  console.error = () => {};
  world();
});

const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";
const Q1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Q2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function merchant(o = {}) {
  const row = { id: M1, slug: "himal-brew-house", topic_slug: "himal-brew-house-jhamsikhel", business_name: "Himal Brew House", area: "Jhamsikhel", business_kind: "cafe", kind_label: null, category: "Food", status: "active", thread_title: "Himal Brew House, Jhamsikhel", google_review_url: null, google_maps_url: null, owner_user_id: "user_owner_secret", ...o };
  fake.tables.sync_merchants.push(row);
  return row;
}
function qr(o = {}) {
  const row = { id: Q1, merchant_id: M1, code: "abc3k9xq", label: "Table 1", active: true, created_at: "2026-10-01T00:00:00Z", ...o };
  fake.tables.sync_qr_codes.push(row);
  return row;
}
const events = (type) => fake.tables.sync_events.filter((e) => !type || e.event_type === type);

// ---------- the scan route ----------

const scan = (code, { cookie = "", ua = PHONE } = {}) =>
  scanRoute(new Request(`https://www.kastochhanepal.com/q/${code}`, { headers: { cookie, "user-agent": ua } }), { params: { code } });

test("a scan lands on the business's hub, and is counted once against the right table", async () => {
  merchant(); qr();
  const res = await scan("abc3k9xq");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/hub/himal-brew-house?c=abc3k9xq");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(events().length, 1);
  assert.deepEqual({ type: events()[0].event_type, merchant: events()[0].merchant_id, qr: events()[0].qr_code_id }, { type: "scan", merchant: M1, qr: Q1 });
});

test("a reload, or a second scan within ten minutes, is not counted twice", async () => {
  merchant(); qr();
  const first = await scan("abc3k9xq");
  const cookie = first.headers.get("set-cookie");
  assert.match(cookie, /^kc_q=abc3k9xq; Max-Age=600; Path=\/; HttpOnly; SameSite=Lax; Secure$/);
  assert.equal(events().length, 1);
  const again = await scan("abc3k9xq", { cookie: "theme=dark; kc_q=abc3k9xq; other=1" });
  assert.equal(again.status, 302);
  assert.equal(again.headers.get("location"), "/hub/himal-brew-house?c=abc3k9xq");
  assert.equal(again.headers.get("set-cookie"), null, "no new cookie, and no new count");
  assert.equal(events().length, 1);
  qr({ id: Q2, code: "zzzzzzzz", label: "Table 2" });
  await scan("zzzzzzzz", { cookie: "kc_q=abc3k9xq" });
  assert.equal(events().length, 2, "a different table is a different scan");
});

test("a link preview, a crawler or a script never counts, but still reaches the hub", async () => {
  merchant(); qr();
  for (const ua of ["facebookexternalhit/1.1", "WhatsApp/2.23.20.0", "Googlebot/2.1", "curl/8.4.0", ""]) {
    const res = await scan("abc3k9xq", { ua });
    assert.equal(res.headers.get("location"), "/hub/himal-brew-house?c=abc3k9xq", ua);
  }
  assert.equal(events().length, 0);
});

test("the code is read in any case, and counted the same", async () => {
  merchant(); qr();
  const res = await scan("ABC3K9XQ");
  assert.equal(res.headers.get("location"), "/hub/himal-brew-house?c=abc3k9xq");
  assert.equal(events().length, 1);
});

test("a switched-off code, a removed business and an unknown code all go to the home page, uncounted", async () => {
  merchant(); qr({ active: false });
  assert.equal((await scan("abc3k9xq")).headers.get("location"), "/");
  fake.tables.sync_qr_codes[0].active = true;
  fake.tables.sync_merchants[0].status = "cancelled";
  assert.equal((await scan("abc3k9xq")).headers.get("location"), "/");
  assert.equal((await scan("nosuchco")).headers.get("location"), "/");
  assert.equal(events().length, 0);
});

test("a malformed or hostile code can only ever lead home, never anywhere else", async () => {
  merchant(); qr();
  for (const bad of ["", "abc", "abc3k9xq/../x", "https://evil.com", "//evil.com", "abc3k9\u00e9q", "%2e%2e", "a".repeat(40), "abc3k9xq?x=1", "abc3k9xq#x"]) {
    const res = await scan(bad);
    assert.equal(res.status, 302, bad);
    assert.equal(res.headers.get("location"), "/", `${bad} must not lead anywhere but home`);
  }
  assert.equal(events().length, 0);
});

test("the destination is built from the business's own address in the database, never from the request", async () => {
  merchant({ slug: "x-y" }); qr();
  const res = await scanRoute(new Request("https://evil.example/q/abc3k9xq?next=https://evil.example&redirect=//evil.example", { headers: { "user-agent": PHONE, "x-forwarded-host": "evil.example", referer: "https://evil.example" } }), { params: { code: "abc3k9xq" } });
  assert.equal(res.headers.get("location"), "/hub/x-y?c=abc3k9xq");
  assert.ok(!(res.headers.get("location") || "").includes("evil"));
  const source = fs.readFileSync("app/q/[code]/route.js", "utf8");
  assert.ok(!/searchParams|headers\.get\("(host|x-forwarded-host|referer|origin)"\)/.test(source), "the route reads nothing from the request that could steer it");
});

test("a database that cannot be read sends a customer home; a count that cannot be written still lets them through", async () => {
  merchant(); qr();
  fake.failReadsFrom = "sync_qr_codes";
  assert.equal((await scan("abc3k9xq")).headers.get("location"), "/");
  fake.failReadsFrom = null;
  fake.failWritesTo = "sync_events";
  const res = await scan("abc3k9xq");
  assert.equal(res.headers.get("location"), "/hub/himal-brew-house?c=abc3k9xq", "counting never blocks the customer");
  assert.equal(events().length, 0);
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  fake.failWritesTo = null;
  assert.equal((await scan("abc3k9xq")).headers.get("location"), "/", "no database at all is still not an error page");
  process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
});

// ---------- the tap route ----------

const tap = (body, { ip = "203.0.113.7", raw } = {}) =>
  tapRoute(new Request("https://www.kastochhanepal.com/api/sync/event", { method: "POST", headers: { "content-type": "application/json", "x-vercel-forwarded-for": ip }, body: raw ?? JSON.stringify(body) }));

test("a tap on the hub is recorded against the business and the table", async () => {
  merchant(); qr();
  for (const type of HUB_CLICK_EVENTS) assert.equal((await tap({ slug: "himal-brew-house", code: "abc3k9xq", type })).status, 204, type);
  assert.deepEqual(events().map((e) => e.event_type).sort(), ["hub_google", "hub_maps", "hub_share"]);
  assert.ok(events().every((e) => e.merchant_id === M1 && e.qr_code_id === Q1));
});

test("a tap with no code is still counted for the business", async () => {
  merchant(); qr();
  assert.equal((await tap({ slug: "himal-brew-house", type: "hub_share" })).status, 204);
  assert.equal((await tap({ slug: "himal-brew-house", code: "", type: "hub_share" })).status, 204);
  assert.equal(events().length, 2);
  assert.ok(events().every((e) => e.qr_code_id === null));
});

test("a code that belongs to another business, or is switched off, is ignored, not trusted", async () => {
  merchant(); qr();
  merchant({ id: M2, slug: "momo-hub", topic_slug: "momo-hub-pulchowk", business_name: "Momo Hub", area: "Pulchowk" });
  qr({ id: Q2, merchant_id: M2, code: "zzzzzzzz", label: "Momo table" });
  await tap({ slug: "himal-brew-house", code: "zzzzzzzz", type: "hub_share" });
  assert.equal(events()[0].merchant_id, M1);
  assert.equal(events()[0].qr_code_id, null, "another business's table is not credited");
  fake.tables.sync_qr_codes[0].active = false;
  await tap({ slug: "himal-brew-house", code: "abc3k9xq", type: "hub_share" });
  assert.equal(events()[1].qr_code_id, null);
  await tap({ slug: "himal-brew-house", code: "not a code!", type: "hub_share" });
  assert.equal(events().length, 3);
  assert.equal(events()[2].qr_code_id, null);
});

test("only the taps the hub can make are accepted: not a scan, not a post, not an invented event", async () => {
  merchant(); qr();
  for (const type of ["scan", "post_created", "google_copy", "hub_ask", "hub_note", "nonsense", "", undefined, null, 5, "HUB_SHARE", ["hub_share"]]) {
    assert.equal((await tap({ slug: "himal-brew-house", type })).status, 400, String(type));
  }
  assert.equal(events().length, 0, "a visitor cannot inflate scans or fake a post");
});

test("a business that does not exist, or whose tag was removed, is refused", async () => {
  merchant({ status: "cancelled" });
  assert.equal((await tap({ slug: "himal-brew-house", type: "hub_share" })).status, 404);
  assert.equal((await tap({ slug: "no-such-cafe", type: "hub_share" })).status, 404);
  for (const slug of ["", "a b", "../x", null, undefined, 5]) assert.equal((await tap({ slug, type: "hub_share" })).status, 404, String(slug));
  assert.equal(events().length, 0);
});

test("a body that is junk or too big is refused before it is read", async () => {
  merchant();
  for (const raw of ["{not json", "", "[1,2]", "null", '"hello"']) assert.equal((await tap(null, { raw })).status, 400, JSON.stringify(raw));
  assert.equal((await tap({ slug: "himal-brew-house", type: "hub_share", pad: "x".repeat(40_000) })).status, 413);
  assert.equal(events().length, 0);
});

test("a tap is limited per visitor address: a flood is stopped, another visitor is not", async () => {
  merchant();
  const body = { slug: "himal-brew-house", type: "hub_share" };
  let allowed = 0;
  let limited = null;
  for (let i = 0; i < 125; i += 1) {
    const res = await tap(body, { ip: "198.51.100.9" });
    if (res.status === 204) allowed += 1;
    else limited = res;
  }
  assert.equal(allowed, 120, "120 a minute from one address");
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
  assert.equal(events().length, 120, "the rest were stopped before they cost a write");
  assert.equal((await tap(body, { ip: "198.51.100.10" })).status, 204, "a different visitor is unaffected");
  assert.ok(globalThis.__KC_TEST__.seenIdentifiers.includes("198.51.100.9"), "bucketed by the visitor's address");
});

test("if the limiter is down, the tap still works (a count is not worth an outage)", async () => {
  merchant();
  world({ upstash: "error" });
  assert.equal((await tap({ slug: "himal-brew-house", type: "hub_share" })).status, 204);
  assert.equal(events().length, 1);
});

test("the limit is checked before any database work", () => {
  const source = fs.readFileSync("app/api/sync/event/route.js", "utf8");
  assert.ok(source.indexOf('checkRateLimit("hub"') > -1);
  assert.ok(source.indexOf('checkRateLimit("hub"') < source.indexOf("getMerchantBySlug("));
  assert.match(fs.readFileSync("lib/ratelimit.js", "utf8"), /hub: \{ tokens: 120, window: "1 m" \}/);
});

// ---------- the event helpers ----------

test("every kind of event the database allows is one the code knows, and no more", () => {
  // The list is redefined by later migrations as events are added: the last one to define it wins.
  const defining = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort().filter((f) => fs.readFileSync(`supabase/migrations/${f}`, "utf8").includes("sync_events_type_check"));
  const sql = fs.readFileSync(`supabase/migrations/${defining[defining.length - 1]}`, "utf8").replace(/--.*$/gm, "");
  const inDb = sql.match(/event_type in \(([^)]*)\)/s)[1].match(/'([a-z_]+)'/g).map((t) => t.replace(/'/g, "")).sort();
  assert.deepEqual([...EVENT_TYPES].sort(), inDb);
  for (const type of HUB_CLICK_EVENTS) assert.ok(EVENT_TYPES.includes(type));
});

test("logging an event never throws, and refuses what the database would", async () => {
  const supabase = createServerSupabase();
  assert.equal(await logHubEvent(supabase, { merchantId: M1, type: "scan" }), true);
  assert.equal(await logHubEvent(supabase, { merchantId: M1, type: "bogus" }), false);
  assert.equal(await logHubEvent(supabase, { type: "scan" }), false);
  fake.failWritesTo = "sync_events";
  assert.equal(await logHubEvent(supabase, { merchantId: M1, type: "scan" }), false);
});

test("a code is found with its business, and a bad or missing one is not", async () => {
  merchant(); qr();
  const supabase = createServerSupabase();
  const found = await findQrByCode(supabase, "ABC3k9xq");
  assert.equal(found.qr.id, Q1);
  assert.equal(found.merchant.slug, "himal-brew-house");
  assert.equal(await findQrByCode(supabase, "nosuchco"), null);
  const before = fake.requests.length;
  for (const bad of ["", "x", "../a", null, undefined, 12345678]) assert.equal(await findQrByCode(supabase, bad), null);
  assert.equal(fake.requests.length, before, "a malformed code never reaches the database");
});

test("a new code retries when the one it picked is taken, and gives up politely", async () => {
  merchant(); qr({ code: "aaaaaaaa" });
  const supabase = createServerSupabase();
  let n = 0;
  const made = await createQrCode(supabase, { merchantId: M1, label: "Counter", generate: () => (++n <= 2 ? "aaaaaaaa" : "bbbbbbbb") });
  assert.equal(made.code, "bbbbbbbb");
  assert.equal(n, 3, "two collisions, then a free code");
  await assert.rejects(() => createQrCode(supabase, { merchantId: M1, label: "x", generate: () => "aaaaaaaa", attempts: 3 }), /unused code/);
  fake.failWritesTo = "sync_qr_codes";
  await assert.rejects(() => createQrCode(supabase, { merchantId: M1, label: "x" }));
});

test("a business's codes are listed with their scans, all time and this week", async () => {
  merchant(); qr(); qr({ id: Q2, code: "zzzzzzzz", label: "Counter", created_at: "2026-10-02T00:00:00Z" });
  const now = Date.UTC(2026, 10, 4, 12, 0, 0);
  const at = (days) => new Date(now - days * 86400000).toISOString();
  fake.tables.sync_events.push(
    { merchant_id: M1, qr_code_id: Q1, event_type: "scan", created_at: at(1) }, { merchant_id: M1, qr_code_id: Q1, event_type: "scan", created_at: at(6.9) },
    { merchant_id: M1, qr_code_id: Q1, event_type: "scan", created_at: at(20) }, { merchant_id: M1, qr_code_id: Q1, event_type: "hub_share", created_at: at(1) },
    { merchant_id: M1, qr_code_id: null, event_type: "scan", created_at: at(1) }, { merchant_id: M2, qr_code_id: Q1, event_type: "scan", created_at: at(1) }
  );
  const list = await listQrCodes(createServerSupabase(), M1, { now });
  assert.deepEqual(list.map((c) => [c.label, c.scans, c.scans7]), [["Table 1", 3, 2], ["Counter", 0, 0]]);
  fake.failReadsFrom = "sync_events";
  await assert.rejects(() => listQrCodes(createServerSupabase(), M1));
});

// ---------- what the hub offers ----------

test("a hub with no Google links offers sharing on KastoChha, to the thread's own address", () => {
  const actions = hubActions({ topic_slug: "himal-brew-house-jhamsikhel", google_review_url: null, google_maps_url: null });
  assert.deepEqual(actions.map((a) => a.key), ["share"]);
  assert.equal(actions[0].href, "/discussions/himal-brew-house-jhamsikhel#share");
  assert.equal(actions[0].external, false);
  assert.equal(actions[0].event, "hub_share");
});

test("Google options appear only when there is a Google link, in the design's order, and all alike", () => {
  const actions = hubActions({ topic_slug: "t", google_review_url: "https://g.page/r/abc/review", google_maps_url: "https://maps.app.goo.gl/abc" });
  assert.deepEqual(actions.map((a) => a.key), ["share", "google", "maps"]);
  assert.deepEqual(actions.map((a) => a.event), ["hub_share", "hub_google", "hub_maps"]);
  assert.deepEqual(actions.map((a) => a.external), [false, true, true]);
  for (const a of actions) assert.deepEqual(Object.keys(a).sort(), ["event", "external", "hint", "href", "key", "title"], "every option has the same shape: none is given more weight");
  assert.ok(actions.every((a) => HUB_CLICK_EVENTS.includes(a.event)), "every option reports an event the tap route accepts");
});

test("a link that is not Google's is never offered", () => {
  const actions = hubActions({ topic_slug: "t", google_review_url: "https://evil.example/review", google_maps_url: "javascript:alert(1)" });
  assert.deepEqual(actions.map((a) => a.key), ["share"]);
});

test("the options for things that do not exist yet are not shown", () => {
  const source = fs.readFileSync("lib/sync/hub.js", "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/key: "(ask|note)"/.test(source), "no button for a question or a private note until they work");
});

test("the hub names the business and its kind", () => {
  assert.deepEqual(hubFacts({ business_name: "Himal Brew House", area: "Jhamsikhel", business_kind: "cafe" }), { name: "Himal Brew House", area: "Jhamsikhel", kindName: "Cafe", title: "Himal Brew House, Jhamsikhel" });
  assert.equal(hubFacts({ business_name: "R", area: "A", business_kind: "other_business", kind_label: "Motorcycle workshop" }).kindName, "Motorcycle workshop");
});

// ---------- the admin's QR routes ----------

const json = (url, method, body) => new Request(`https://www.kastochhanepal.com${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const create = (id, body) => createRoute(json(`/api/admin/sync/merchants/${id}/qr`, "POST", body), { params: { id } });
const edit = (qrId, body) => updateRoute(json(`/api/admin/sync/qr/${qrId}`, "PUT", body), { params: { qrId } });
const download = (qrId, query = "", base = "https://www.kastochhanepal.com") => downloadRoute(new Request(`${base}/api/admin/sync/qr/${qrId}/download${query}`), { params: { qrId } });

test("only an admin may make, change or download a QR code", async () => {
  merchant(); qr();
  for (const role of [null, "user"]) {
    world({ role });
    const expected = role ? 403 : 401;
    assert.equal((await create(M1, { label: "x" })).status, expected);
    assert.equal((await edit(Q1, { label: "x" })).status, expected);
    assert.equal((await download(Q1)).status, expected);
  }
  assert.equal(fake.tables.sync_qr_codes.length, 1);
  assert.equal(fake.tables.admin_audit_log.length, 0);
});

test("a new code is made at random, labelled, audited, and starts with no scans", async () => {
  merchant();
  world({ role: "admin" });
  const res = await create(M1, { label: "  Table \t 4 ", code: "hackedxx", id: "ffffffff-ffff-4fff-8fff-ffffffffffff", active: false });
  assert.equal(res.status, 201);
  const { qr: made } = await res.json();
  assert.match(made.code, /^[a-hj-km-np-z2-9]{8}$/);
  assert.notEqual(made.code, "hackedxx", "the browser cannot choose the code");
  assert.notEqual(made.id, "ffffffff-ffff-4fff-8fff-ffffffffffff");
  assert.equal(made.label, "Table 4");
  assert.equal(made.active, true);
  assert.deepEqual([made.scans, made.scans7], [0, 0]);
  assert.equal(fake.tables.sync_qr_codes.length, 1);
  const [entry] = fake.tables.admin_audit_log;
  assert.equal(entry.action, "sync.qr.create");
  assert.equal(entry.status, "applied");
  assert.equal(entry.actor_id, "user_a");
  assert.equal(entry.target_id, made.id);
});

test("an empty label becomes 'Table', and a long one is refused", async () => {
  merchant();
  world({ role: "admin" });
  assert.equal((await (await create(M1, {})).json()).qr.label, "Table");
  assert.equal((await (await create(M1, { label: "   " })).json()).qr.label, "Table");
  assert.equal((await create(M1, { label: "x".repeat(61) })).status, 400);
  assert.equal((await create(M1, { label: "x".repeat(60) })).status, 201);
  assert.equal(fake.tables.sync_qr_codes.length, 3);
});

test("a code cannot be made for a business that is missing, removed, or already has the most", async () => {
  merchant({ status: "cancelled" });
  world({ role: "admin" });
  assert.equal((await create("not-a-uuid", { label: "x" })).status, 400);
  assert.equal((await create("33333333-3333-4333-8333-333333333333", { label: "x" })).status, 404);
  const removed = await create(M1, { label: "x" });
  assert.equal(removed.status, 409);
  assert.match((await removed.json()).error, /Restore the tag/);
  fake.tables.sync_merchants[0].status = "active";
  for (let i = 0; i < MAX_CODES_PER_BUSINESS; i += 1) fake.tables.sync_qr_codes.push({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, merchant_id: M1, code: `code${String(i).padStart(4, "0")}`, label: `T${i}`, active: true, created_at: "2026-10-01T00:00:00Z" });
  const full = await create(M1, { label: "one too many" });
  assert.equal(full.status, 409);
  assert.match((await full.json()).error, /at most 30/);
  assert.equal(fake.tables.sync_qr_codes.length, MAX_CODES_PER_BUSINESS);
});

test("if the audit log is down nothing is made, and a failed save is recorded as failed", async () => {
  merchant();
  world({ role: "admin" });
  fake.failWritesTo = "admin_audit_log";
  const noAudit = await create(M1, { label: "x" });
  assert.equal(noAudit.status, 500);
  assert.match((await noAudit.json()).error, /audit log/);
  assert.equal(fake.tables.sync_qr_codes.length, 0);
  fake.failWritesTo = "sync_qr_codes";
  assert.equal((await create(M1, { label: "x" })).status, 500);
  assert.equal(fake.tables.admin_audit_log[0].status, "failed");
});

test("a code can be renamed, and switched off and on, each audited; the code itself never changes", async () => {
  merchant(); qr();
  world({ role: "admin" });
  let res = await edit(Q1, { label: " Window  seat " });
  assert.equal((await res.json()).qr.label, "Window seat");
  res = await edit(Q1, { active: false });
  assert.equal((await res.json()).qr.active, false);
  res = await edit(Q1, { active: true, code: "hackedxx", merchant_id: M2, id: Q2 });
  const after = (await res.json()).qr;
  assert.deepEqual([after.active, after.code, after.merchant_id, after.id], [true, "abc3k9xq", M1, Q1], "only the label and the switch can change");
  assert.deepEqual(fake.tables.admin_audit_log.map((e) => e.action), ["sync.qr.update", "sync.qr.switch_off", "sync.qr.switch_on"]);
});

test("an edit with nothing valid in it, or for a missing code, is refused", async () => {
  merchant(); qr();
  world({ role: "admin" });
  for (const body of [{}, { label: "" }, { label: "   " }, { label: "x".repeat(61) }, { active: "yes" }, { active: 1 }, { active: null }]) assert.equal((await edit(Q1, body)).status, 400, JSON.stringify(body));
  assert.equal((await edit("not-a-uuid", { label: "x" })).status, 400);
  assert.equal((await edit("33333333-3333-4333-8333-333333333333", { label: "x" })).status, 404);
  assert.equal(fake.tables.admin_audit_log.length, 0);
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await edit(Q1, { label: "audit down" })).status, 500);
  assert.equal(fake.tables.sync_qr_codes[0].label, "Table 1");
});

async function scanBytes(res) {
  const bytes = Buffer.from(await res.arrayBuffer());
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
}

test("the PNG download scans to this code's address on the site", async () => {
  merchant(); qr();
  world({ role: "admin" });
  const res = await download(Q1, "?format=png");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(res.headers.get("content-disposition"), 'attachment; filename="himal-brew-house-table-1.png"');
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(await scanBytes(res), "https://www.kastochhanepal.com/q/abc3k9xq");
});

test("the PDF download is the A5 sheet, and its QR code scans to the same address", async () => {
  merchant(); qr();
  world({ role: "admin" });
  const res = await download(Q1, "?format=pdf");
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.equal(res.headers.get("content-disposition"), 'attachment; filename="himal-brew-house-table-1.pdf"');
  const bytes = Buffer.from(await res.arrayBuffer());
  const text = bytes.toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4") && text.endsWith("%%EOF\n"));
  assert.ok(text.includes("(Himal Brew House,)") && text.includes("(Jhamsikhel)"), "the business's name and area");
  const stream = text.slice(text.indexOf("stream\n") + 7, text.indexOf("\nendstream"));
  const px = 4, W = Math.ceil(PAGE_A5.width * px), H = Math.ceil(PAGE_A5.height * px);
  const rgba = new Uint8ClampedArray(W * H * 4).fill(255);
  for (const m of stream.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re\n/g)) {
    const [x, y, w, h] = [m[1], m[2], m[3], m[4]].map(Number);
    for (let yy = Math.round((PAGE_A5.height - y - h) * px); yy < Math.round((PAGE_A5.height - y) * px); yy += 1) for (let xx = Math.round(x * px); xx < Math.round((x + w) * px); xx += 1) rgba[(yy * W + xx) * 4] = rgba[(yy * W + xx) * 4 + 1] = rgba[(yy * W + xx) * 4 + 2] = 0;
  }
  assert.equal(jsQR(rgba, W, H)?.data, "https://www.kastochhanepal.com/q/abc3k9xq");
});

test("the preview is shown in the page, a bad format falls back to PNG, and the file name is always safe", async () => {
  merchant({ slug: "x-y" }); qr({ label: "Caf\u00e9 \"Window\" <b>1</b> \u0939\u093f\u092e\u093e\u0932" });
  world({ role: "admin" });
  assert.match((await download(Q1, "?format=png&inline=1")).headers.get("content-disposition"), /^inline; filename="x-y-[a-z0-9-]+\.png"$/);
  const odd = await download(Q1, "?format=exe");
  assert.equal(odd.headers.get("content-type"), "image/png");
  assert.match(odd.headers.get("content-disposition"), /^attachment; filename="[a-z0-9.-]+"$/);
  fake.tables.sync_qr_codes[0].label = "\u0939\u093f\u092e\u093e\u0932";
  assert.match((await download(Q1)).headers.get("content-disposition"), /filename="x-y-qr\.png"/, "a label with no plain letters still gets a plain name");
});

test("with no site address set, the code points at the address the admin is using, which the panel shows", async () => {
  merchant(); qr();
  world({ role: "admin" });
  delete process.env.NEXT_PUBLIC_SITE_URL;
  const res = await download(Q1, "?format=png", "https://kasto-preview.vercel.app");
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.kastochhanepal.com";
  assert.equal(await scanBytes(res), "https://kasto-preview.vercel.app/q/abc3k9xq");
});

test("a missing code or business is a clean error, and a broken database is reported", async () => {
  merchant(); qr();
  world({ role: "admin" });
  assert.equal((await download("not-a-uuid")).status, 400);
  assert.equal((await download("33333333-3333-4333-8333-333333333333")).status, 404);
  fake.failReadsFrom = "sync_qr_codes";
  assert.equal((await download(Q1)).status, 500);
  fake.failReadsFrom = null;
  fake.tables.sync_merchants.length = 0;
  assert.equal((await download(Q1)).status, 500);
});

// ---------- guards on the screens ----------

const read = (file) => fs.readFileSync(file, "utf8");

test("every admin QR route checks for an admin before it reads or writes anything", () => {
  for (const file of ["app/api/admin/sync/merchants/[id]/qr/route.js", "app/api/admin/sync/qr/[qrId]/route.js", "app/api/admin/sync/qr/[qrId]/download/route.js"]) {
    const source = read(file);
    assert.match(source, /requireRole\(ROLE\.ADMIN\)/, file);
    assert.ok(source.indexOf("requireRole(") < source.indexOf("createServerSupabase()"), `${file} touches the database before the role check`);
    assert.ok(source.indexOf("requireRole(") < (source.indexOf("readJsonBody(") === -1 ? Infinity : source.indexOf("readJsonBody(")), file);
  }
  for (const file of ["app/api/admin/sync/merchants/[id]/qr/route.js", "app/api/admin/sync/qr/[qrId]/route.js"]) {
    assert.ok(read(file).indexOf("openAuditEntry(") < Math.max(read(file).indexOf(".insert("), read(file).indexOf("createQrCode(supabase"), read(file).indexOf(".update(values)")) , `${file} writes before it audits`);
  }
});

test("the hub page is public, kept out of search engines, and has no hub for a missing or removed business", () => {
  const page = read("app/hub/[slug]/page.js");
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /if \(!merchant\) notFound\(\)/);
  assert.ok(!/requireRole|auth\(\)|currentUser/.test(page), "the hub needs no login");
  assert.match(page, /redirect\(`\/hub\/\$\{merchant\.slug\}/, "one address for a hub, whatever case was typed");
  assert.match(page, /isValidCode\(searchParams\?\.c\)/, "a code from the address is validated before it is used");
  const code = page.replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of [/\bhours\b/i, /\bphone\b/i, /\bmenu\b/i, /\bprices?\b/i, /dangerouslySetInnerHTML/]) assert.ok(!forbidden.test(code), `the hub page mentions ${forbidden}`);
});

test("robots.txt keeps crawlers off the hub and the scan route, and still lets share images through", async () => {
  const { GET } = await import("../app/robots.txt/route.js");
  const body = await (await GET()).text();
  assert.match(body, /^Disallow: \/hub\/$/m);
  assert.match(body, /^Disallow: \/q\/$/m);
  assert.match(body, /^Allow: \/api\/og$/m);
  assert.match(body, /^Disallow: \/api$/m);
  assert.ok(body.indexOf("Allow: /api/og") < body.indexOf("Disallow: /api"));
});

test("a tap is a plain link that works with no script, and reports with sendBeacon when script runs", () => {
  const action = read("app/hub/[slug]/HubAction.js");
  assert.match(action, /^"use client";/);
  assert.match(action, /<a className="hub-action" href=\{action\.href\} onClick=\{report\}/);
  assert.match(action, /navigator\.sendBeacon\("\/api\/sync\/event"/);
  assert.match(action, /target: "_blank", rel: "noopener noreferrer"/);
  assert.match(action, /catch \{/, "a reporting failure is swallowed");
  assert.ok(!/lib\/sync\/(merchants|qr|suggest|threads|hubToken)|supabase|node:crypto/.test(action), "the browser component imports something server-only");
});

test("the admin shows each code's address, so a code is never printed blind", () => {
  const panel = read("app/admin/sync/[id]/QrCodesPanel.js");
  assert.match(panel, /const address = `\$\{siteUrl \|\| "\(this site\)"\}\/q\/\$\{code\.code\}`/);
  assert.match(panel, /NEXT_PUBLIC_SITE_URL is not set/);
  assert.match(panel, /alt=\{`QR code for \$\{code\.label\}`\}/);
  assert.match(read("app/admin/sync/[id]/page.js"), /siteUrl=\{process\.env\.NEXT_PUBLIC_SITE_URL \|\| ""\}/);
  assert.ok(!/lib\/sync\/(merchants|qr|threads|hubToken)|supabase/.test(panel), "the panel imports something server-only");
});

test("the code is made on the server: the create route hands the browser's words nowhere near it", () => {
  const route = read("app/api/admin/sync/merchants/[id]/qr/route.js");
  assert.match(route, /createQrCode\(supabase, \{ merchantId: params\.id, label, id \}\)/, "the route must pass only the business, the label and a fresh id");
  assert.ok(!/(data|body)\??\.(code|id|active|merchant_id)/.test(route.replace(/\/\/.*$/gm, "")), "the route reads something other than the label from the request");
  const helper = read("lib/sync/qr.js");
  assert.match(helper, /code: generate\(\), label, active: true/);
});
