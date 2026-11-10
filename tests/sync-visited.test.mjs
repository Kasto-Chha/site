// Patch 6: the "Visited" label, asking a question, and "copy my text and open Google".
// The label is the part that could do harm if it were wrong (a label that can be forged, or a post
// that a label problem could block), so most of this file is about the ways it can and cannot be earned.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const SECRET = "s".repeat(40);
process.env.SYNC_HUB_SECRET = SECRET;

const { GET: scanRoute } = await import("../app/q/[code]/route.js");
const { POST: postRoute } = await import("../app/api/reviews/route.js");
const { POST: tapRoute } = await import("../app/api/sync/event/route.js");
const { VISIT_COOKIE_PREFIX, visitCookieName, readCookie, visitCookieFor, visitedCredit } = await import("../lib/sync/visited.js");
const { signHubToken, verifyHubToken, HUB_TOKEN_TTL_SECONDS } = await import("../lib/sync/hubToken.js");
const { copyAndOpenGoogle, COPY_WAIT_MS } = await import("../lib/sync/googleCopy.js");
const { nepalDay, nepalDayStart, DAY, NEPAL_OFFSET_MS } = await import("../lib/sync/time.js");
const { buildOverview } = await import("../lib/sync/overview.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");

const fake = new FakePostgrest();
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SYNC_HUB_SECRET"];
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
  process.env.SYNC_HUB_SECRET = SECRET;
  globalThis.__KC_TEST__ = { userId: null, roles: {}, cookies: {}, revalidatedPaths: [] };
});

const A = { id: "11111111-1111-4111-8111-111111111111", slug: "himal-brew-house", topic_slug: "himal-brew-house-jhamsikhel", thread_title: "Himal Brew House, Jhamsikhel", business_name: "Himal Brew House", area: "Jhamsikhel" };
const B = { id: "22222222-2222-4222-8222-222222222222", slug: "momo-hub", topic_slug: "momo-hub-pulchowk", thread_title: "Momo Hub, Pulchowk", business_name: "Momo Hub", area: "Pulchowk" };
const QA = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", merchant_id: A.id, code: "abc3k9xq", label: "Counter", active: true, created_at: "2026-10-01T00:00:00Z" };
const QB = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", merchant_id: B.id, code: "zzzzzzzz", label: "Table 1", active: true, created_at: "2026-10-01T00:00:00Z" };
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function merchant(o) {
  const row = { business_kind: "cafe", kind_label: null, category: "Food", status: "active", google_review_url: null, google_maps_url: null, owner_user_id: "secret", ...o };
  fake.tables.sync_merchants.push(row);
  return row;
}
const seedBoth = () => { merchant(A); merchant(B); fake.tables.sync_qr_codes.push(QA, QB); };
const events = (type) => fake.tables.sync_events.filter((e) => !type || e.event_type === type);
const iso = (ms) => new Date(ms).toISOString();

// ---------- Nepal days ----------

test("the start of a Nepal day is its first instant, and the whole day maps to it", () => {
  const start = Date.UTC(2026, 10, 3, 18, 15, 0); // 4 Nov 00:00 in Nepal
  assert.equal(nepalDayStart(start), start);
  assert.equal(nepalDayStart(start - 1), start - DAY, "a millisecond earlier is yesterday");
  assert.equal(nepalDayStart(start + DAY - 1), start);
  assert.equal(nepalDayStart(start + DAY), start + DAY);
  for (const ms of [Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 31, 23, 59), Date.now(), Date.UTC(2028, 1, 29, 12)]) {
    const s = nepalDayStart(ms);
    assert.ok(s <= ms && ms < s + DAY, String(ms));
    assert.equal(nepalDay(s), nepalDay(ms));
    assert.equal(new Date(s + NEPAL_OFFSET_MS).toISOString().slice(10), "T00:00:00.000Z", "it is midnight in Nepal");
  }
});

// ---------- the cookie ----------

test("a cookie is named for its business, so two cafes never overwrite each other", () => {
  assert.equal(visitCookieName("himal-brew-house"), "kc_v_himal-brew-house");
  assert.equal(VISIT_COOKIE_PREFIX, "kc_v_");
  assert.notEqual(visitCookieName(A.slug), visitCookieName(B.slug));
});

test("cookies are read by exact name, whatever else is in the header", () => {
  const header = "theme=dark; kc_q=abc3k9xq;  kc_v_himal-brew-house=tok.en=with=equals ; other=1";
  assert.equal(readCookie(header, "kc_v_himal-brew-house"), "tok.en=with=equals");
  assert.equal(readCookie(header, "kc_q"), "abc3k9xq");
  assert.equal(readCookie(header, "kc_v_himal"), "", "a name that is only the start of another is not it");
  assert.equal(readCookie(header, "missing"), "");
  for (const empty of ["", null, undefined]) assert.equal(readCookie(empty, "kc_q"), "");
});

test("the cookie is signed for one business and one card, short-lived, and hidden from scripts", () => {
  const now = Date.UTC(2026, 10, 4, 12, 0, 0);
  const line = visitCookieFor({ merchant: A, qr: QA, secure: true, now });
  assert.match(line, /^kc_v_himal-brew-house=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+; Max-Age=21600; Path=\/; HttpOnly; SameSite=Lax; Secure$/);
  assert.equal(HUB_TOKEN_TTL_SECONDS, 21600);
  assert.ok(!visitCookieFor({ merchant: A, qr: QA, secure: false, now }).includes("Secure"));
  const token = line.split(";")[0].split("=").slice(1).join("=");
  const ok = verifyHubToken(token, { merchantId: A.id, now: now + 1000 });
  assert.equal(ok.ok, true);
  assert.equal(ok.qrCodeId, QA.id, "it remembers which card was scanned");
  assert.equal(verifyHubToken(token, { merchantId: B.id, now }).reason, "wrong-merchant");
  assert.equal(verifyHubToken(token, { merchantId: A.id, now: now + 6 * 3600 * 1000 }).reason, "expired");
  assert.equal(verifyHubToken(token, { merchantId: A.id, now: now + 6 * 3600 * 1000 - 2000 }).ok, true, "good right up to six hours");
});

test("with no secret, or a short one, no cookie is made, and scanning is unaffected", () => {
  process.env.SYNC_HUB_SECRET = "";
  assert.equal(visitCookieFor({ merchant: A, qr: QA }), null);
  process.env.SYNC_HUB_SECRET = "too-short";
  assert.equal(visitCookieFor({ merchant: A, qr: QA }), null);
  delete process.env.SYNC_HUB_SECRET;
  assert.equal(visitCookieFor({ merchant: A, qr: QA }), null);
});

// ---------- the scan route gives it ----------

const scan = (code, { cookie = "", ua = PHONE, url = "https://www.kastochhanepal.com" } = {}) =>
  scanRoute(new Request(`${url}/q/${code}`, { headers: { cookie, "user-agent": ua } }), { params: { code } });
const setCookies = (res) => res.headers.getSetCookie();
const pairOf = (line) => line.split(";")[0];
const byName = (res, name) => setCookies(res).find((c) => c.startsWith(`${name}=`));

test("a real scan gets the visit cookie and the scan cookie, and is counted once", async () => {
  seedBoth();
  const res = await scan("abc3k9xq");
  assert.equal(res.headers.get("location"), "/hub/himal-brew-house?c=abc3k9xq");
  assert.equal(setCookies(res).length, 2);
  assert.match(byName(res, "kc_v_himal-brew-house"), /HttpOnly; SameSite=Lax; Secure$/);
  assert.match(byName(res, "kc_q"), /^kc_q=abc3k9xq; Max-Age=600/);
  assert.equal(events("scan").length, 1);
  const token = pairOf(byName(res, "kc_v_himal-brew-house")).split("=").slice(1).join("=");
  assert.deepEqual({ ok: verifyHubToken(token, { merchantId: A.id }).ok, qr: verifyHubToken(token, { merchantId: A.id }).qrCodeId }, { ok: true, qr: QA.id });
});

test("scanning again within ten minutes is not counted again, but starts the six hours again", async () => {
  seedBoth();
  const first = await scan("abc3k9xq");
  const again = await scan("abc3k9xq", { cookie: `${pairOf(byName(first, "kc_q"))}` });
  assert.equal(events("scan").length, 1, "not counted twice");
  assert.equal(setCookies(again).length, 1, "only the visit cookie: the scan cookie is already there");
  assert.match(byName(again, "kc_v_himal-brew-house"), /^kc_v_himal-brew-house=/);
});

test("each business has its own cookie, so a second cafe does not replace the first", async () => {
  seedBoth();
  const a = await scan("abc3k9xq");
  const b = await scan("zzzzzzzz");
  assert.ok(byName(a, "kc_v_himal-brew-house") && !byName(a, "kc_v_momo-hub"));
  assert.ok(byName(b, "kc_v_momo-hub") && !byName(b, "kc_v_himal-brew-house"));
});

test("no cookie is given to a link preview, a crawler, a script, a switched-off card or a removed business", async () => {
  seedBoth();
  for (const ua of ["facebookexternalhit/1.1", "WhatsApp/2.23", "Googlebot/2.1", "curl/8.4", ""]) {
    const res = await scan("abc3k9xq", { ua });
    assert.equal(res.headers.get("location"), "/hub/himal-brew-house?c=abc3k9xq", ua);
    assert.deepEqual(setCookies(res), [], ua);
  }
  fake.tables.sync_qr_codes[0].active = false;
  assert.deepEqual(setCookies(await scan("abc3k9xq")), []);
  fake.tables.sync_qr_codes[0].active = true;
  fake.tables.sync_merchants[0].status = "cancelled";
  assert.deepEqual(setCookies(await scan("abc3k9xq")), []);
  assert.equal(events("scan").length, 0);
});

test("with no secret set, scanning works exactly as before and there is just no visit cookie", async () => {
  seedBoth();
  process.env.SYNC_HUB_SECRET = "";
  const res = await scan("abc3k9xq");
  assert.equal(res.headers.get("location"), "/hub/himal-brew-house?c=abc3k9xq");
  assert.deepEqual(setCookies(res).map((c) => c.split("=")[0]), ["kc_q"]);
  assert.equal(events("scan").length, 1);
});

test("over plain http (a test site) the cookie is not marked Secure, so it can still be set", async () => {
  seedBoth();
  const res = await scan("abc3k9xq", { url: "http://localhost:3000" });
  assert.ok(!byName(res, "kc_v_himal-brew-house").includes("Secure"));
});

// ---------- the posting route ----------

const as = (userId) => { globalThis.__KC_TEST__ = { userId, roles: {}, cookies: {}, revalidatedPaths: [] }; };
const post = (body, { cookie = "", user = "user_customer" } = {}) => {
  as(user);
  return postRoute(new Request("https://www.kastochhanepal.com/api/reviews", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) }));
};
const EXPERIENCE = (o = {}) => ({ title: A.thread_title, category: "Food", summary: "Great coffee, quiet in the afternoon.", verdict: "Ramro chha", ...o });
const visitPair = (m = A, q = QA, now = Date.now()) => pairOf(visitCookieFor({ merchant: m, qr: q, secure: true, now }));
const rows = () => fake.tables.reviews;

test("an experience posted within six hours of a scan carries the label, and is counted against the card", async () => {
  seedBoth();
  const res = await post(EXPERIENCE(), { cookie: visitPair() });
  assert.equal(res.status, 200);
  const { review } = await res.json();
  assert.equal(review.source, "qr");
  assert.equal(rows()[0].source, "qr");
  assert.equal(rows()[0].topic_slug, A.topic_slug, "and it is in the business's own thread");
  assert.deepEqual({ type: events()[0].event_type, merchant: events()[0].merchant_id, qr: events()[0].qr_code_id }, { type: "post_created", merchant: A.id, qr: QA.id });
});

test("an ordinary post is exactly as it was: no label, no event, and one small lookup (is the poster this business's owner?)", async () => {
  seedBoth();
  const before = fake.requests.length;
  const res = await post(EXPERIENCE());
  assert.equal(res.status, 200);
  assert.ok(!("source" in rows()[0]) || rows()[0].source == null);
  assert.equal(events().length, 0);
  const asked = fake.requests.slice(before).filter((r) => String(r.table).startsWith("sync_"));
  assert.deepEqual(asked.map((r) => r.table), ["sync_merchants"], "one lookup, on the merchants table, and nothing on the QR codes or events");
  assert.ok(/owner_user_id=eq\.user_customer/.test(asked[0].url || asked[0].path || JSON.stringify(asked[0])), "and it is the owner check, by the poster's own id");
});

test("the browser cannot ask for the label: a source in the body is ignored", async () => {
  seedBoth();
  const res = await post(EXPERIENCE({ source: "qr", visited: true, user_id: "someone_else" }));
  assert.equal(res.status, 200);
  assert.ok(rows()[0].source == null, "no cookie, no label, whatever the body says");
  assert.equal(rows()[0].user_id, "user_customer");
  assert.equal(events().length, 0);
});

test("the cookie only counts for its own business: a card scanned elsewhere earns nothing here", async () => {
  seedBoth();
  const forged = `${visitCookieName(A.slug)}=${visitPair(B, QB).split("=").slice(1).join("=")}`; // B's token under A's name
  const res = await post(EXPERIENCE(), { cookie: forged });
  assert.equal(res.status, 200);
  assert.ok(rows()[0].source == null, "a token made for another business is refused");
  const other = await post(EXPERIENCE(), { cookie: visitPair(B, QB), user: "user_two" });
  assert.equal(other.status, 200);
  assert.ok(rows()[1].source == null, "Momo Hub's cookie says nothing about Himal Brew House's thread");
});

test("a cookie that is tampered with, cut short, empty or not a token earns nothing, and the post still goes through", async () => {
  seedBoth();
  const good = visitPair().split("=").slice(1).join("=");
  const name = visitCookieName(A.slug);
  const bad = [`${name}=${good}x`, `${name}=${good.slice(0, -5)}`, `${name}=${good.replace(/^./, (c) => (c === "a" ? "b" : "a"))}`, `${name}=`, `${name}=garbage`, `${name}=${"a".repeat(500)}`, `${name}=${good}.${good}`, "kc_v_other=whatever", `${name.toUpperCase()}=${good}`];
  let n = 0;
  for (const cookie of bad) {
    const res = await post(EXPERIENCE({ summary: `post ${n}` }), { cookie, user: `user_${n++}` });
    assert.equal(res.status, 200, cookie.slice(0, 40));
  }
  assert.ok(rows().every((r) => r.source == null), "none of them earned the label");
  assert.equal(rows().length, bad.length, "every post was saved");
  assert.equal(events().length, 0);
});

test("a cookie older than six hours earns nothing", async () => {
  seedBoth();
  const old = visitPair(A, QA, Date.now() - 6 * 3600 * 1000 - 5000);
  assert.equal((await post(EXPERIENCE(), { cookie: old })).status, 200);
  assert.ok(rows()[0].source == null);
  const fresh = visitPair(A, QA, Date.now() - 5 * 3600 * 1000);
  assert.equal((await post(EXPERIENCE({ summary: "later" }), { cookie: fresh, user: "user_two" })).status, 200);
  assert.equal(rows()[1].source, "qr", "five hours is fine");
});

test("with no secret set, nothing is ever labelled, and posting is unaffected", async () => {
  seedBoth();
  const cookie = visitPair();
  process.env.SYNC_HUB_SECRET = "";
  const res = await post(EXPERIENCE(), { cookie });
  assert.equal(res.status, 200);
  assert.ok(rows()[0].source == null);
  assert.equal(events().length, 0);
});

test("a question is never labelled, even with a good cookie", async () => {
  seedBoth();
  const res = await post({ title: A.thread_title, category: "Food", kind: "question", summary: "Is it quiet in the afternoon?" }, { cookie: visitPair() });
  assert.equal(res.status, 200);
  assert.equal(rows()[0].kind, "question");
  assert.ok(rows()[0].source == null);
  assert.equal(events().length, 0);
});

test("a business whose tag was removed, and a thread with no business, give no label", async () => {
  seedBoth();
  fake.tables.sync_merchants[0].status = "cancelled";
  assert.equal((await post(EXPERIENCE(), { cookie: visitPair() })).status, 200);
  assert.ok(rows()[0].source == null);
  assert.equal((await post({ title: "Sikko Calculator", category: "Tech & Gadgets", summary: "Battery lasts all day.", verdict: "Ramro chha" }, { cookie: visitPair(), user: "user_two" })).status, 200);
  assert.ok(rows()[1].source == null);
});

test("only the first labelled post from a person on a thread each Nepal day", async () => {
  seedBoth();
  const cookie = visitPair();
  const first = await (await post(EXPERIENCE({ summary: "first" }), { cookie })).json();
  const second = await post(EXPERIENCE({ summary: "second" }), { cookie });
  assert.equal(second.status, 200, "the second post is saved");
  assert.equal(first.review.source, "qr");
  assert.ok(rows()[1].source == null, "but it does not carry the label");
  assert.equal(events("post_created").length, 1, "and is not counted as one");
  const third = await post(EXPERIENCE({ summary: "someone else" }), { cookie, user: "user_two" });
  assert.equal(rows()[2].source, "qr", "another person, same day, same thread: labelled");
  assert.equal(third.status, 200);
});

test("the one-a-day limit is per business: a label at one cafe does not use up the other's", async () => {
  seedBoth();
  const cookie = `${visitPair(A, QA)}; ${visitPair(B, QB)}`;
  await post(EXPERIENCE({ summary: "at Himal" }), { cookie });
  await post({ title: B.thread_title, category: "Food", summary: "at Momo Hub", verdict: "Ramro chha" }, { cookie });
  assert.deepEqual(rows().map((r) => [r.topic_slug, r.source]), [[A.topic_slug, "qr"], [B.topic_slug, "qr"]]);
});

test("the day turns over at Nepal's midnight: a label yesterday does not block one today", async () => {
  seedBoth();
  const start = nepalDayStart(Date.now());
  const labelled = (when) => ({ id: `old-${when}`, user_id: "user_customer", topic_slug: A.topic_slug, source: "qr", kind: "experience", title: A.thread_title, topic: A.thread_title, category: "Food", summary: "earlier", created_at: iso(when) });
  fake.tables.reviews.push(labelled(start - 1));
  const res = await post(EXPERIENCE({ summary: "today" }), { cookie: visitPair() });
  assert.equal(res.status, 200);
  assert.equal(rows().find((r) => r.summary === "today").source, "qr", "a labelled post a millisecond before midnight is yesterday's");
  fake.reset(); seedBoth(); process.env.SYNC_HUB_SECRET = SECRET;
  const fresh = nepalDayStart(Date.now());
  fake.tables.reviews.push(labelled(fresh));
  await post(EXPERIENCE({ summary: "again today" }), { cookie: visitPair() });
  assert.ok(rows().find((r) => r.summary === "again today").source == null, "a labelled post at the first instant of today blocks another today");
});

test("a post made without the label is not 'used up' by earlier unlabelled posts", async () => {
  seedBoth();
  await post(EXPERIENCE({ summary: "no cookie yet" }));
  const res = await post(EXPERIENCE({ summary: "after scanning" }), { cookie: visitPair() });
  assert.equal(res.status, 200);
  assert.equal(rows().find((r) => r.summary === "after scanning").source, "qr");
});

test("a failing lookup, or a failing count, never costs a post, and the label survives a failing count", async () => {
  seedBoth();
  fake.failReadsFrom = "sync_merchants";
  assert.equal((await post(EXPERIENCE({ summary: "lookup down" }), { cookie: visitPair() })).status, 200);
  assert.ok(rows()[0].source == null, "no label when it could not be checked");
  fake.failReadsFrom = null;
  fake.failWritesTo = "sync_events";
  assert.equal((await post(EXPERIENCE({ summary: "count down" }), { cookie: visitPair(), user: "user_two" })).status, 200);
  assert.equal(rows()[1].source, "qr", "the label is the post's; the count is only a count");
  assert.equal(events().length, 0);
});

test("if the label's column does not exist yet, the post is saved without it, in its thread", async () => {
  seedBoth();
  fake.missingColumns = { reviews: ["source"] };
  const res = await post(EXPERIENCE({ summary: "no source column" }), { cookie: visitPair() });
  assert.equal(res.status, 200);
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].topic_slug, A.topic_slug, "still in the business's thread: only the label is lost");
  assert.ok(!("source" in rows()[0]));
  assert.equal(events().length, 0, "and it is not counted as a labelled post");
});

test("if the thread column is missing too, the older fallback still works", async () => {
  seedBoth();
  fake.missingColumns = { reviews: ["topic_slug"] };
  const res = await post(EXPERIENCE({ summary: "old database" }));
  assert.equal(res.status, 200, "an ordinary post is unchanged by this patch");
  assert.equal(rows().length, 1);
});

test("a labelled post is the same as an ordinary one in everything but its label", async () => {
  seedBoth();
  const plain = (await (await post(EXPERIENCE({ summary: "same words" }), { user: "user_a" })).json()).review;
  const labelled = (await (await post(EXPERIENCE({ summary: "same words" }), { cookie: visitPair(), user: "user_b" })).json()).review;
  const strip = (r) => { const { id, created_at, user_id, author_name, source, ...rest } = r; return rest; };
  assert.deepEqual(strip(labelled), strip(plain));
  assert.equal(labelled.source, "qr");
});

test("with many cookies on the request, the right one is found", async () => {
  seedBoth();
  const cookie = `theme=dark; ${visitPair(B, QB)}; session=abc; ${visitPair(A, QA)}; kc_q=abc3k9xq`;
  assert.equal((await post(EXPERIENCE(), { cookie })).status, 200);
  assert.equal(rows()[0].source, "qr");
});

test("the credit check itself, called directly, answers null for anything wrong and never throws", async () => {
  seedBoth();
  const supabase = createServerSupabase();
  const request = (cookie) => ({ headers: { get: (h) => (h === "cookie" ? cookie : null) } });
  const ok = await visitedCredit({ supabase, request: request(visitPair()), slug: A.topic_slug, userId: "u" });
  assert.deepEqual(ok, { merchantId: A.id, qrCodeId: QA.id });
  for (const cookie of ["", "x=y", visitPair(B, QB), `${visitCookieName(A.slug)}=junk`]) assert.equal(await visitedCredit({ supabase, request: request(cookie), slug: A.topic_slug, userId: "u" }), null, cookie);
  assert.equal(await visitedCredit({ supabase, request: request(visitPair()), slug: "no-such-thread", userId: "u" }), null);
  assert.equal(await visitedCredit({ supabase, request: { headers: null }, slug: A.topic_slug, userId: "u" }), null, "a malformed request does not throw");
  assert.equal(await visitedCredit({ supabase: null, request: request(visitPair()), slug: A.topic_slug, userId: "u" }), null, "nor does a missing database");
});

// ---------- the taps this patch adds ----------

const tap = (body) => tapRoute(new Request("https://www.kastochhanepal.com/api/sync/event", { method: "POST", headers: { "content-type": "application/json", "x-vercel-forwarded-for": "203.0.113.5" }, body: JSON.stringify(body) }));

test("'Ask a question' on the hub is counted against the card; 'copy and open Google' against the business only", async () => {
  seedBoth();
  assert.equal((await tap({ slug: A.slug, code: QA.code, type: "hub_ask" })).status, 204);
  assert.equal(events("hub_ask")[0].qr_code_id, QA.id);
  assert.equal((await tap({ slug: A.slug, type: "google_copy" })).status, 204);
  assert.equal(events("google_copy")[0].merchant_id, A.id);
  assert.equal((await tap({ slug: A.slug, code: QA.code, type: "google_copy" })).status, 204);
  assert.equal(events("google_copy")[1].qr_code_id, QA.id, "a code sent with a page tap is checked like any other");
});

test("a post cannot be counted by a visitor: post_created stays server-only", async () => {
  seedBoth();
  assert.equal((await tap({ slug: A.slug, type: "post_created" })).status, 400);
  assert.equal(events().length, 0);
});

// ---------- copy my text and open Google ----------

function copyHarness({ clipboard, open, track } = {}) {
  const log = [];
  return {
    log,
    args: (over = {}) => ({
      text: "Great coffee", url: "https://search.google.com/local/writereview?placeid=x", slug: "himal-brew-house", waitMs: 50,
      clipboard: clipboard ?? { writeText: (t) => new Promise((resolve) => setTimeout(() => { log.push(["copy", t]); resolve(); }, 5)) },
      open: open ?? ((...a) => { log.push(["open", ...a]); return null; }),
      track: track ?? ((e) => log.push(["track", e])),
      ...over
    })
  };
}

test("the words are copied FIRST and waited for, then Google opens, then the tap is counted", async () => {
  const h = copyHarness();
  const copied = await copyAndOpenGoogle(h.args());
  assert.equal(copied, true);
  assert.deepEqual(h.log.map((e) => e[0]), ["copy", "open", "track"], "a browser refuses a copy once a new tab has focus, so the copy must finish before the page opens");
  assert.deepEqual(h.log[0], ["copy", "Great coffee"]);
  assert.deepEqual(h.log[1], ["open", "https://search.google.com/local/writereview?placeid=x", "_blank", "noopener,noreferrer"]);
  assert.deepEqual(h.log[2], ["track", { slug: "himal-brew-house", type: "google_copy" }]);
});

test("if the copy is refused, Google still opens, and the answer says it was not copied", async () => {
  for (const clipboard of [{ writeText: () => Promise.reject(new Error("denied")) }, { writeText: () => { throw new Error("sync throw"); } }, {}, null]) {
    const h = copyHarness({ clipboard });
    assert.equal(await copyAndOpenGoogle({ ...h.args(), clipboard }), false);
    assert.ok(h.log.some((e) => e[0] === "open"), "Google opened anyway");
    assert.ok(h.log.some((e) => e[0] === "track"), "and the tap was counted");
  }
});

test("a clipboard that never answers does not hold the visitor: Google opens after a short wait", async () => {
  const h = copyHarness({ clipboard: { writeText: () => new Promise(() => {}) } });
  const started = Date.now();
  const copied = await copyAndOpenGoogle({ ...h.args(), clipboard: { writeText: () => new Promise(() => {}) }, waitMs: 30 });
  assert.equal(copied, false);
  assert.ok(Date.now() - started < 500, "it waited only the short time");
  assert.ok(h.log.some((e) => e[0] === "open"));
  assert.ok(COPY_WAIT_MS <= 1000, "a second at most, so the click is still fresh for a pop-up blocker");
});

test("a pop-up the browser blocks, or a counter that fails, break nothing", async () => {
  const h = copyHarness({ open: () => { throw new Error("blocked"); }, track: () => { throw new Error("down"); } });
  assert.equal(await copyAndOpenGoogle(h.args()), true, "the words were still copied");
  const h2 = copyHarness();
  await copyAndOpenGoogle(h2.args({ text: 12345 }));
  assert.deepEqual(h2.log[0], ["copy", "12345"], "whatever it is given, it copies text");
});

// ---------- the Overview ----------

test("the overview counts the new taps and the Visited posts, and only experiences can be Visited", () => {
  const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
  const ago = (d) => iso(NOW - d * DAY);
  const m = { ...A, business_kind: "cafe", kind_label: null, status: "active", created_at: ago(60), google_review_url: "https://g.page/r/a/review", google_maps_url: null };
  const o = buildOverview({
    merchants: [m], qrCodes: [{ id: "q", merchant_id: A.id, code: "abc3k9xq", label: "Counter", active: true }],
    events: [{ merchant_id: A.id, qr_code_id: "q", event_type: "scan", created_at: ago(1) }, ...["hub_ask", "hub_ask", "google_copy", "hub_share"].map((t) => ({ merchant_id: A.id, qr_code_id: null, event_type: t, created_at: ago(1) }))],
    posts: [
      { topic_slug: A.topic_slug, kind: "experience", source: "qr", created_at: ago(1) }, { topic_slug: A.topic_slug, kind: "experience", source: null, created_at: ago(1) },
      { topic_slug: A.topic_slug, kind: "experience", source: "qr", created_at: ago(40) }, { topic_slug: A.topic_slug, kind: "question", source: "qr", created_at: ago(1) }
    ],
    range: "7d", now: NOW
  });
  assert.deepEqual(o.totals.taps, { share: 1, ask: 2, google: 0, copy: 1, maps: 0, note: 0 });
  assert.equal(o.totals.tapsTotal, 4);
  assert.deepEqual(o.totals.posts, { experiences: 2, questions: 1, visited: 1 }, "the old one is outside the week, and a question is never Visited");
  assert.equal(o.rows[0].visited, 1);
  assert.equal(o.rows[0].taps, 4);
  assert.equal(buildOverview({ merchants: [m], qrCodes: [], events: [], posts: [{ topic_slug: A.topic_slug, kind: "experience", source: "qr", created_at: ago(40) }], range: "all", now: NOW }).totals.posts.visited, 1);
});

// ---------- guards on the screens ----------

const read = (file) => fs.readFileSync(file, "utf8");

test("the question box posts a question under the thread's pinned title, and opens at #ask", () => {
  const ask = read("app/discussions/[slug]/AskComposer.js");
  assert.match(ask, /^"use client";/);
  assert.match(ask, /body: JSON\.stringify\(\{ title: postTitle, category, kind: "question", verdict: "", summary \}\)/);
  assert.match(ask, /window\.location\.hash === "#ask"/);
  assert.match(ask, /id="ask"/);
  assert.match(ask, /useRequireSignIn\(\{\s*draftKey: `ask:\$\{slug\}`/);
  assert.ok(!/lib\/sync\/(visited|merchants|qr|hubToken)|supabase|node:crypto/.test(ask), "a browser component importing something server-only");
  const page = read("app/discussions/[slug]/page.js");
  assert.equal((page.match(/<AskComposer/g) || []).length, 2, "on a page with posts and on one with none");
  assert.match(page, /<AskComposer[^>]*defaultOpen/, "open on a page with nothing else to read");
  assert.match(page, /postTitle=\{pinnedTitle\(merchant\)\}/);
});

test("the header offers asking, and says plainly what Visited does and does not mean", () => {
  const header = read("app/discussions/[slug]/BusinessHeader.js");
  assert.match(header, /href="#ask">Ask a question</);
  assert.match(header, /A post marked Visited was written by someone who opened this business&apos;s QR link in the 6 hours before posting\. It is not proof of a visit\./);
  assert.ok(header.indexOf('href="#share"') < header.indexOf('href="#ask"'));
});

test("the Visited mark is drawn on a post, both in a card's preview and in the full list, with the honest tooltip", () => {
  const card = read("app/components/TopicThread.js");
  assert.equal((card.match(/source === "qr" \? <VisitedMark \/> : null/g) || []).length, 2);
  assert.match(card, /Opened this business's QR link in the 6 hours before posting\. Not proof of a visit\./);
  assert.match(read("app/components/businessChip.css"), /\.exp-visited/);
});

test("the Google offer is made after a post, on both ways of posting, and an ordinary thread renders as it did", () => {
  const client = read("app/discussions/[slug]/ThreadClient.js");
  assert.match(client, /if \(googleUrl && summary\) \{\s*setLastPost\(summary\);/, "the offer is still made after a post (patch 11a also brings it into view)");
  assert.match(client, /if \(!googleUrl \|\| !lastPost\) return withQuestions;/, "no offer showing: nothing is added");
  assert.match(client, /const withQuestions = ownerName \?[\s\S]*: \(\s*thread\s*\);/, "an ordinary thread (no business) renders just the thread, exactly as before");
  const first = read("app/discussions/[slug]/FirstPostComposer.js");
  assert.match(first, /if \(googleUrl\) \{\s*setPosted\(summary\);[\s\S]*?\} else \{\s*router\.refresh\(\);/, "offer for a business with a Google link, otherwise the page refreshes (patch 11a also brings the result into view)");
  assert.match(first, /<GoogleCopyCard text=\{posted\}/);
  const page = read("app/discussions/[slug]/page.js");
  assert.equal((page.match(/googleUrl=\{biz\.reviewUrl\}/g) || []).length, 2);
  assert.equal((page.match(/businessSlug=\{merchant\.slug\}/g) || []).length, 2);
});

test("'copy my text and open Google' waits for the copy before it opens, and always leaves a plain link", () => {
  const card = read("app/discussions/[slug]/GoogleCopyCard.js");
  const handler = card.slice(card.indexOf("async function go()"), card.indexOf("return (", card.indexOf("async function go()")));
  assert.match(handler, /await copyAndOpenGoogle\(/);
  assert.ok(!/window\.open\(/.test(handler.replace(/open: \(\.\.\.args\) => window\.open\(\.\.\.args\),/, "")), "the page is opened only by the helper, after the copy");
  assert.match(card, /Google did not open\?/);
  assert.match(card, /href=\{googleUrl\} target="_blank" rel="noopener noreferrer"/);
  assert.match(card, /We can&apos;t post for you/);
  assert.match(card, /Not now/);
  assert.match(card, /navigator\.sendBeacon\("\/api\/sync\/event"/);
  assert.ok(!/lib\/sync\/(visited|merchants|qr|hubToken)|supabase|node:crypto/.test(card));
});

test("the route that gives the cookie and the route that reads it share one name rule, and nothing else sets or reads it", () => {
  const users = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = `${dir}/${e.name}`; if (e.isDirectory()) { if (!["node_modules", ".next", ".git"].includes(e.name)) walk(f); } else if (/\.(js|mjs)$/.test(e.name) && !f.startsWith("tests/")) { if (/kc_v_|visitCookieFor|visitedCredit/.test(read(f))) users.push(f); } } };
  walk("app"); walk("lib");
  // The smoke checker only looks for the cookie's NAME in a response, to say whether Visited labels are on: it never sets or reads one.
  assert.deepEqual(users.sort(), ["app/api/reviews/route.js", "app/q/[code]/route.js", "lib/sync/smoke.mjs", "lib/sync/visited.js"]);
});

test("the overview says plainly when the label is switched off for want of the secret", () => {
  const page = read("app/admin/sync/page.js");
  assert.match(page, /!hubTokenConfigured\(\) \?/);
  assert.match(page, /Visited labels are off: SYNC_HUB_SECRET is not set in Vercel, or is shorter than 32 characters\./);
});
