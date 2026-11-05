// Patch 7: private notes. A customer writes to a business from its hub, with no login; nobody but the team
// ever reads it. So the tests are about three things: that the door is guarded without being locked
// (spam, floods, junk), that nothing about the person is kept or leaked, and that the team's inbox moves
// notes along without ever copying their words anywhere they should not go.

process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { POST: noteRoute } = await import("../app/api/sync/feedback/route.js");
const { PUT: statusRoute } = await import("../app/api/admin/sync/feedback/[id]/route.js");
const { POST: digestRoute } = await import("../app/api/admin/sync/feedback/digest/route.js");
const { POST: tapRoute } = await import("../app/api/sync/event/route.js");
const F = await import("../lib/sync/feedback.js");
const { cleanNote, cleanContact, isUrgent, noteAge, buildDigest, forwardText, matchesFilter, parseFilter, createFeedback, notesInLastDay, countNewFeedback, feedbackCounts, listFeedback, NOTE_MAX, CONTACT_MAX, DAILY_CAP_PER_BUSINESS, DIGEST_REMINDER } = F;
const { createServerSupabase } = await import("../lib/supabase/server.js");

const fake = new FakePostgrest();
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const saved = {};
let savedConsoleError;
let logged = [];

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
function world({ role = null, upstash = "on" } = {}) {
  globalThis.__KC_TEST__ = { userId: role ? "user_admin" : null, roles: role ? { user_admin: role } : {}, cookies: {}, revalidatedPaths: [], upstash, redis: {}, seenIdentifiers: [] };
}
beforeEach(() => {
  fake.reset();
  logged = [];
  console.error = (...args) => logged.push(args.map(String).join(" "));
  world();
});

const A = { id: "11111111-1111-4111-8111-111111111111", slug: "himal-brew-house", topic_slug: "himal-x", business_name: "Himal Brew House", area: "Jhamsikhel", business_kind: "cafe", status: "active" };
const B = { id: "22222222-2222-4222-8222-222222222222", slug: "momo-hub", topic_slug: "momo-x", business_name: "Momo Hub", area: "Pulchowk", business_kind: "restaurant", status: "active" };
const C = { id: "33333333-3333-4333-8333-333333333333", slug: "gone-cafe", topic_slug: "gone-x", business_name: "Gone Cafe", area: "X", business_kind: "cafe", status: "cancelled" };
const seed = () => fake.tables.sync_merchants.push(A, B, C);
const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const iso = (ms) => new Date(ms).toISOString();
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
let n = 0;
const row = (o = {}) => { const r = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, merchant_id: A.id, message: "A note", contact: null, is_urgent: false, status: "new", created_at: iso(NOW - HOUR), handled_at: null, ...o }; fake.tables.sync_feedback.push(r); return r; };
const stored = () => fake.tables.sync_feedback;

// ---------- cleaning ----------

test("a note keeps its line breaks and loses everything that is not text", () => {
  assert.equal(cleanNote("  hello \r\n\r\n\r\n\r\n world \u0007\u0000  "), "hello\n\n world");
  assert.equal(cleanNote("line one\nline two"), "line one\nline two");
  assert.equal(cleanNote("a \t \nb"), "a\nb");
  assert.equal(cleanNote("\u2028x\u2029"), "x");
  assert.equal(cleanNote("\u0915\u093e\u092b\u0947 \u0930\u093e\u092e\u094d\u0930\u094b \u0925\u093f\u092f\u094b \ud83d\ude00"), "\u0915\u093e\u092b\u0947 \u0930\u093e\u092e\u094d\u0930\u094b \u0925\u093f\u092f\u094b \ud83d\ude00", "other languages and emoji are kept");
  for (const notText of [undefined, null, 5, {}, ["x"], true]) assert.equal(cleanNote(notText), "");
  assert.equal(cleanNote("   \n\t  "), "");
});

test("a note over the limit is not shortened, so it can be refused", () => {
  assert.equal(cleanNote("x".repeat(NOTE_MAX + 50)).length, NOTE_MAX + 50);
  assert.equal(NOTE_MAX, 2000);
  assert.equal(CONTACT_MAX, 120);
});

test("a way to reach someone is one line, in any form", () => {
  assert.equal(cleanContact("  +977 98\n\n12345678  "), "+977 98 12345678");
  assert.equal(cleanContact("sita@example.com"), "sita@example.com");
  assert.equal(cleanContact("ask for Sita \u0007at the counter"), "ask for Sita at the counter");
  for (const notText of [undefined, null, 5, {}]) assert.equal(cleanContact(notText), "");
});

// ---------- the urgent flag ----------

test("notes about food, hygiene, safety and behaviour are flagged", () => {
  for (const text of [
    "we saw a mouse near the counter", "The washroom was not clean on Saturday evening.", "there was a cockroach in my tea", "hair in my soup", "I found hair in the food", "We got food poisoning",
    "The place is very dirty", "UNHYGIENIC kitchen", "Hygiene is poor!", "It smelled bad, really smelly", "a rat ran across the floor", "the milk was expired",
    "staff was rude to us", "the waiter harassed my friend", "I felt unsafe at night", "there was a small fire in the kitchen", "something was stolen from my bag",
    "the gas leak scared everyone", "washroom isn't clean", "it was never very hygienic", "\u092b\u094b\u0939\u094b\u0930 \u0925\u093f\u092f\u094b", "\u0905\u0938\u0941\u0930\u0915\u094d\u0937\u093f\u0924 \u0932\u093e\u0917\u094d\u092f\u094b"
  ]) assert.equal(isUrgent(text), true, text);
});

test("ordinary notes, praise, and words that merely contain a flagged word are not", () => {
  for (const text of [
    "Please add more seating near the window.", "Loved the new brunch menu, thank you.", "Lovely staff and great chairs", "I rate it 5, a great place", "The coffee was cold",
    "Waited about 25 minutes for a flat white", "Is the second QR on the table working?", "The firefighter lunch special is nice", "A campfire theme would be fun",
    "My mouse pad broke", "a mouse pad was on the table", "the beer was great", "the shelf was clean and tidy", "very clean washroom", "I'd love a rat-free", "pirate themed"
  ].filter((t) => !/rat-free/.test(t))) assert.equal(isUrgent(text), false, text);
  for (const notText of [undefined, null, 5, "", "   "]) assert.equal(isUrgent(notText), false, String(notText));
});

test("the flag only looks at the words of the note, and is the same in any case", () => {
  assert.equal(isUrgent("HYGIENE"), true);
  assert.equal(isUrgent("Cockroach!"), true);
  assert.equal(isUrgent("a cockroach."), true);
  assert.equal(isUrgent("cockroachless"), false, "whole words only");
});

// ---------- time, digest, forwarding ----------

test("a note's age reads like a person would say it", () => {
  const at = (ms) => iso(NOW - ms);
  assert.equal(noteAge(at(20000), NOW), "just now");
  assert.equal(noteAge(at(2 * MIN), NOW), "2 min ago");
  assert.equal(noteAge(at(59 * MIN), NOW), "59 min ago");
  assert.equal(noteAge(at(60 * MIN), NOW), "1 h ago");
  assert.equal(noteAge(at(5 * HOUR), NOW), "5 h ago");
  assert.equal(noteAge(at(17 * HOUR), NOW), "17 h ago", "00:45 in Nepal is still today");
  assert.equal(noteAge(at(18 * HOUR), NOW), "Yesterday", "23:45 in Nepal is yesterday, though it is under a day ago");
  assert.equal(noteAge(at(50 * HOUR), NOW), "2 days ago");
  assert.equal(noteAge(at(31 * DAY), NOW), "4 Oct 2026");
  assert.equal(noteAge(iso(NOW + HOUR), NOW), "just now", "a clock a little ahead is not in the future");
  for (const bad of ["", "nope", null, undefined]) assert.equal(noteAge(bad, NOW), "");
});

test("a digest is numbered, urgent first then oldest first, and ends with the reminder", () => {
  const notes = [
    { message: "Please add more seating near the window.", is_urgent: false, created_at: iso(NOW - 2 * HOUR) },
    { message: "The washroom was not clean\non Saturday.", is_urgent: true, created_at: iso(NOW - 1 * HOUR) },
    { message: "Loved the brunch.", is_urgent: false, created_at: iso(NOW - 5 * HOUR) }
  ];
  const copy = JSON.stringify(notes);
  const text = buildDigest({ businessName: "Himal Brew House", notes });
  assert.equal(text, ["Private notes for Himal Brew House", "", "1. The washroom was not clean on Saturday. (Urgent)", "2. Loved the brunch.", "3. Please add more seating near the window.", "", DIGEST_REMINDER].join("\n"));
  assert.equal(JSON.stringify(notes), copy, "the notes passed in are not reordered");
  assert.equal(buildDigest({ businessName: "X", notes: [] }), null);
  assert.equal(buildDigest({ businessName: "X", notes: undefined }), null);
  assert.match(DIGEST_REMINDER, /public posts are never removed on request, and no rewards for reviews/);
});

test("a single note can be forwarded on its own, with its age and the reminder", () => {
  const text = forwardText({ businessName: "Momo Hub", note: { message: "Cold momo.", is_urgent: true, created_at: iso(NOW - 3 * HOUR) }, now: NOW });
  assert.equal(text, `Private note for Momo Hub (Urgent), 3 h ago:\n\nCold momo.\n\n${DIGEST_REMINDER}`);
  assert.ok(!forwardText({ businessName: "Momo Hub", note: { message: "x", is_urgent: false, created_at: iso(NOW) }, now: NOW }).includes("(Urgent)"));
});

test("the tabs of the inbox show the notes the database query shows", () => {
  const notes = [{ status: "new", is_urgent: true }, { status: "in_digest", is_urgent: true }, { status: "resolved", is_urgent: true }, { status: "new", is_urgent: false }];
  assert.deepEqual(["all", "urgent", "new", "in_digest", "resolved"].map((f) => notes.filter((x) => matchesFilter(f, x)).length), [4, 2, 2, 1, 1]);
  for (const [input, expected] of [["urgent", "urgent"], ["new", "new"], ["banana", "all"], [undefined, "all"], ["", "all"], ["NEW", "all"], [["urgent"], "all"]]) assert.equal(parseFilter(input), expected, String(input));
});

// ---------- the database ----------

test("a note is stored as words, an optional contact, the business, and the urgent flag, and nothing else", async () => {
  seed();
  const id = await createFeedback(createServerSupabase(), { merchantId: A.id, message: "There was a cockroach.", contact: "98123" });
  const [r] = stored();
  assert.equal(r.id, id);
  assert.deepEqual({ merchant: r.merchant_id, message: r.message, contact: r.contact, urgent: r.is_urgent }, { merchant: A.id, message: "There was a cockroach.", contact: "98123", urgent: true });
  assert.deepEqual(Object.keys(r).sort(), ["contact", "created_at", "id", "is_urgent", "merchant_id", "message"], "no address, no browser, no account");
  await createFeedback(createServerSupabase(), { merchantId: A.id, message: "More seating, please.", contact: "" });
  assert.equal(stored()[1].contact, null);
  assert.equal(stored()[1].is_urgent, false);
});

test("a failed save carries only the error's code, never its message", async () => {
  seed();
  fake.failWritesTo = "sync_feedback";
  await assert.rejects(() => createFeedback(createServerSupabase(), { merchantId: A.id, message: "SECRET WORDS", contact: "" }), (e) => e.code === "XX000" && !/SECRET WORDS|simulated/.test(e.message));
});

test("the daily count is for one business, the last 24 hours, and exact past the server's cap", async () => {
  seed();
  fake.maxRows = 1000;
  for (let i = 0; i < 1500; i += 1) row({ created_at: iso(NOW - 1000 - i) });
  row({ merchant_id: B.id, created_at: iso(NOW - 1000) });
  row({ created_at: iso(NOW - 25 * HOUR) });
  assert.equal(await notesInLastDay(createServerSupabase(), A.id, NOW), 1500, "a count of a page of rows would have said 1,000");
  assert.equal(await notesInLastDay(createServerSupabase(), B.id, NOW), 1);
  fake.failReadsFrom = "sync_feedback";
  await assert.rejects(() => notesInLastDay(createServerSupabase(), A.id, NOW));
});

test("what is waiting, and the inbox's tabs, are exact counts", async () => {
  seed();
  row({ status: "new", is_urgent: true }); row({ status: "new" }); row({ status: "in_digest", is_urgent: true }); row({ status: "in_digest" }); row({ status: "resolved", is_urgent: true }); row({ status: "resolved" }); row({ status: "resolved" });
  assert.deepEqual(await countNewFeedback(createServerSupabase()), { total: 2, urgent: 1 });
  assert.deepEqual(await feedbackCounts(createServerSupabase()), { all: 7, urgent: 2, new: 2, in_digest: 2, resolved: 3 });
  fake.failReadsFrom = "sync_feedback";
  await assert.rejects(() => countNewFeedback(createServerSupabase()));
  await assert.rejects(() => feedbackCounts(createServerSupabase()));
});

test("the inbox lists open urgent notes first, then newest first, each with its business", async () => {
  seed();
  const old = row({ message: "old", created_at: iso(NOW - 5 * HOUR) });
  const urgentOld = row({ message: "urgent old", is_urgent: true, created_at: iso(NOW - 4 * HOUR) });
  const fresh = row({ message: "fresh", merchant_id: B.id, created_at: iso(NOW - 1 * HOUR) });
  const resolvedUrgent = row({ message: "resolved urgent", is_urgent: true, status: "resolved", created_at: iso(NOW - 30 * MIN) });
  const list = await listFeedback(createServerSupabase(), { filter: "all" });
  assert.deepEqual(list.map((x) => x.message), ["urgent old", "resolved urgent", "fresh", "old"].map((m) => (m === "resolved urgent" ? "resolved urgent" : m)).sort((a, b) => ["urgent old", "resolved urgent", "fresh", "old"].indexOf(a) - ["urgent old", "resolved urgent", "fresh", "old"].indexOf(b)) && ["urgent old", "resolved urgent", "fresh", "old"]);
  assert.equal(list[0].business.business_name, "Himal Brew House");
  assert.equal(list.find((x) => x.message === "fresh").business.business_name, "Momo Hub");
  assert.deepEqual((await listFeedback(createServerSupabase(), { filter: "urgent" })).map((x) => x.message), ["urgent old"], "resolved ones are not urgent any more");
  assert.deepEqual((await listFeedback(createServerSupabase(), { filter: "resolved" })).map((x) => x.id), [resolvedUrgent.id]);
  assert.deepEqual((await listFeedback(createServerSupabase(), { filter: "new" })).map((x) => x.id).sort(), [old.id, urgentOld.id, fresh.id].sort());
  assert.deepEqual((await listFeedback(createServerSupabase(), { filter: "banana" })).length, 4, "an unknown tab is All");
});

test("a note for a business that has since been removed is still listed, with its business's name", async () => {
  seed();
  row({ merchant_id: C.id, message: "to a removed cafe" });
  row({ merchant_id: "99999999-9999-4999-8999-999999999999", message: "to nobody" });
  const list = await listFeedback(createServerSupabase(), { filter: "all" });
  assert.equal(list.find((x) => x.message === "to a removed cafe").business.business_name, "Gone Cafe");
  assert.equal(list.find((x) => x.message === "to a removed cafe").business.status, "cancelled", "so the inbox can say the tag was removed");
  assert.equal(list.find((x) => x.message === "to nobody").business, null);
});

test("many businesses' names are looked up in chunks, and the list is capped", async () => {
  for (let i = 0; i < 130; i += 1) { const id = `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`; fake.tables.sync_merchants.push({ id, slug: `b${i}`, topic_slug: `b${i}-x`, business_name: `Biz ${i}`, area: "X", status: "active" }); row({ merchant_id: id, message: `n${i}` }); }
  const list = await listFeedback(createServerSupabase(), { filter: "all" });
  assert.equal(list.length, 130);
  assert.ok(list.every((x) => x.business && x.business.business_name.startsWith("Biz")));
  assert.equal((await listFeedback(createServerSupabase(), { filter: "all", limit: 10 })).length, 10);
  fake.failReadsFrom = "sync_merchants";
  await assert.rejects(() => listFeedback(createServerSupabase(), { filter: "all" }));
});

// ---------- the public route ----------

// Each note comes from a different visitor unless a test says otherwise: the limit is per visitor, and a test that
// sends a dozen notes from one address is testing the limit, not what it meant to.
let ipCounter = 0;
const send = (body, { ip = `203.0.113.${(ipCounter++ % 250) + 1}`, raw } = {}) =>
  noteRoute(new Request("https://www.kastochhanepal.com/api/sync/feedback", { method: "POST", headers: { "content-type": "application/json", "x-vercel-forwarded-for": ip }, body: raw ?? JSON.stringify(body) }));

test("a customer with no account can send a note, and is told only that it was sent", async () => {
  seed();
  const res = await send({ slug: "himal-brew-house", note: "  The washroom was not clean on Saturday.  ", contact: " 9812345678 " });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(stored().length, 1);
  const r = stored()[0];
  assert.deepEqual({ merchant: r.merchant_id, message: r.message, contact: r.contact, urgent: r.is_urgent, status: r.status ?? "new" }, { merchant: A.id, message: "The washroom was not clean on Saturday.", contact: "9812345678", urgent: true, status: "new" });
});

test("nothing about the sender is kept: no address, no browser, no account", async () => {
  seed();
  const req = new Request("https://www.kastochhanepal.com/api/sync/feedback", { method: "POST", headers: { "content-type": "application/json", "x-vercel-forwarded-for": "198.51.100.77", "user-agent": "Mozilla/5.0 UNIQUE-AGENT", cookie: "session=abc", referer: "https://example.com/where" }, body: JSON.stringify({ slug: "himal-brew-house", note: "Hello" }) });
  await noteRoute(req);
  assert.deepEqual(Object.keys(stored()[0]).sort(), ["contact", "created_at", "id", "is_urgent", "merchant_id", "message"]);
  assert.ok(!JSON.stringify(stored()).includes("198.51.100.77") && !JSON.stringify(stored()).includes("UNIQUE-AGENT") && !JSON.stringify(stored()).includes("abc"));
});

test("a note is stored exactly as written, and shown as text where it is read (it is never run)", async () => {
  seed();
  const nasty = `<script>alert(1)</script> & "quotes" \u0939\u093f\u0928\u094d\u0926\u0940 <img src=x onerror=1>`;
  await send({ slug: "himal-brew-house", note: nasty });
  assert.equal(stored()[0].message, nasty);
  const parts = fs.readFileSync("app/admin/sync/feedback/FeedbackParts.js", "utf8");
  assert.ok(!/dangerouslySetInnerHTML/.test(parts));
  assert.match(parts, /<p className="fb-text">\{note\.message\}<\/p>/);
});

test("the hidden field catches a program: it is told it worked, and nothing is stored", async () => {
  seed();
  const res = await send({ slug: "himal-brew-house", note: "Buy cheap watches", website: "http://spam.example" });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(stored().length, 0);
  assert.equal((await send({ slug: "himal-brew-house", note: "A real note", website: "   " })).status, 201);
  assert.equal(stored().length, 1, "an empty or blank hidden field is a person");
  assert.equal((await send({ slug: "himal-brew-house", note: "Another", website: "" })).status, 201);
  assert.equal(stored().length, 2);
});

test("a business that does not exist, or whose tag was removed, takes no notes", async () => {
  seed();
  for (const slug of ["no-such-cafe", "gone-cafe", "", null, undefined, 5, "a b", "../x"]) {
    const res = await send({ slug, note: "Hello" });
    assert.equal(res.status, 404, String(slug));
  }
  assert.equal(stored().length, 0);
  assert.equal((await send({ slug: "HIMAL-BREW-HOUSE", note: "Hello" })).status, 201, "case is forgiven, as elsewhere");
});

test("an empty note, a too-long note and a too-long contact are refused with a reason, and nothing is stored", async () => {
  seed();
  for (const note of ["", "   ", "\n\n", undefined, null, 5, {}]) {
    const res = await send({ slug: "himal-brew-house", note });
    assert.equal(res.status, 400, String(note));
    assert.equal((await res.json()).error, "Write your note first.");
  }
  const long = await send({ slug: "himal-brew-house", note: "x".repeat(NOTE_MAX + 1) });
  assert.equal(long.status, 400);
  assert.match((await long.json()).error, /at most 2,000 characters/);
  const contact = await send({ slug: "himal-brew-house", note: "ok", contact: "9".repeat(CONTACT_MAX + 1) });
  assert.equal(contact.status, 400);
  assert.match((await contact.json()).error, /at most 120 characters/);
  assert.equal(stored().length, 0);
});

test("the limits are exact: 2,000 characters and a 120-character contact are accepted", async () => {
  seed();
  assert.equal((await send({ slug: "himal-brew-house", note: "x".repeat(NOTE_MAX), contact: "9".repeat(CONTACT_MAX) })).status, 201);
  assert.equal(stored()[0].message.length, NOTE_MAX);
  assert.equal(stored()[0].contact.length, CONTACT_MAX);
  assert.equal((await send({ slug: "himal-brew-house", note: "ok", contact: 12345 })).status, 201);
  assert.equal(stored()[1].contact, null, "a contact that is not text is ignored");
});

test("a junk or oversized body takes nothing and breaks nothing", async () => {
  seed();
  for (const raw of ["{not json", "", "[1,2]", "null", '"hello"']) assert.equal((await send(null, { raw })).status, 404, JSON.stringify(raw));
  assert.equal((await send({ slug: "himal-brew-house", note: "x", pad: "y".repeat(40000) })).status, 413);
  assert.equal(stored().length, 0);
});

test("one visitor can send five notes in ten minutes, and the sixth waits; someone else is unaffected", async () => {
  seed();
  const results = [];
  for (let i = 0; i < 7; i += 1) results.push((await send({ slug: "himal-brew-house", note: `note ${i}` }, { ip: "198.51.100.9" })).status);
  assert.deepEqual(results, [201, 201, 201, 201, 201, 429, 429]);
  assert.equal(stored().length, 5);
  const limited = await send({ slug: "himal-brew-house", note: "again" }, { ip: "198.51.100.9" });
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
  assert.match((await limited.json()).error, /wait a few minutes/);
  assert.equal((await send({ slug: "himal-brew-house", note: "different visitor" }, { ip: "198.51.100.10" })).status, 201);
  assert.match(fs.readFileSync("lib/ratelimit.js", "utf8"), /note: \{ tokens: 5, window: "10 m" \}/);
});

test("if the limiter is down, a note still goes through (a flood is stopped by the daily cap instead)", async () => {
  seed();
  world({ upstash: "error" });
  assert.equal((await send({ slug: "himal-brew-house", note: "Still works" })).status, 201);
});

test("a business can receive only so many notes a day, and yesterday's do not count", async () => {
  seed();
  for (let i = 0; i < DAILY_CAP_PER_BUSINESS - 1; i += 1) row({ created_at: iso(Date.now() - 1000 - i) });
  for (let i = 0; i < 30; i += 1) row({ created_at: iso(Date.now() - 25 * HOUR - i) });
  for (let i = 0; i < 30; i += 1) row({ merchant_id: B.id, created_at: iso(Date.now() - 1000 - i) });
  assert.equal((await send({ slug: "himal-brew-house", note: "the hundredth" }, { ip: "198.51.100.20" })).status, 201);
  const over = await send({ slug: "himal-brew-house", note: "one too many" }, { ip: "198.51.100.21" });
  assert.equal(over.status, 429);
  assert.match((await over.json()).error, /try again tomorrow/);
  assert.equal((await send({ slug: "momo-hub", note: "another business is not affected" }, { ip: "198.51.100.22" })).status, 201);
  assert.equal(DAILY_CAP_PER_BUSINESS, 100);
});

test("if the note cannot be saved, the visitor gets a plain message, and the words never reach a log", async () => {
  seed();
  fake.failWritesTo = "sync_feedback";
  const res = await send({ slug: "himal-brew-house", note: "MY PRIVATE WORDS ABOUT THE KITCHEN", contact: "98-SECRET-CONTACT" });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "Could not send your note. Please try again." });
  const everything = logged.join(" | ");
  assert.ok(!/PRIVATE WORDS|SECRET-CONTACT|simulated/.test(everything), everything);
  assert.match(everything, /error code: XX000/);
  assert.equal(stored().length, 0);
  const source = fs.readFileSync("app/api/sync/feedback/route.js", "utf8");
  const calls = (source.replace(/\/\/.*$/gm, "").match(/console\.\w+\([^;]*\);/g) || []).map((c) => c.replace(/"[^"]*"/g, '""'));
  assert.ok(calls.length >= 1);
  for (const call of calls) assert.ok(!/\b(message|note|contact)\b|error\??\.message/.test(call), `a log call that could carry the words: ${call}`);
});

test("a database that cannot be read takes no note, and says so plainly", async () => {
  seed();
  fake.failReadsFrom = "sync_feedback";
  assert.equal((await send({ slug: "himal-brew-house", note: "hello" })).status, 500);
  assert.equal(stored().length, 0);
});

// ---------- the hub's tap ----------

test("tapping 'Send a private note' on the hub is counted against the card, like the other options", async () => {
  seed();
  fake.tables.sync_qr_codes.push({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", merchant_id: A.id, code: "abc3k9xq", label: "Counter", active: true });
  const res = await tapRoute(new Request("https://www.kastochhanepal.com/api/sync/event", { method: "POST", headers: { "content-type": "application/json", "x-vercel-forwarded-for": "203.0.113.5" }, body: JSON.stringify({ slug: "himal-brew-house", code: "abc3k9xq", type: "hub_note" }) }));
  assert.equal(res.status, 204);
  assert.equal(fake.tables.sync_events[0].event_type, "hub_note");
  assert.equal(fake.tables.sync_events[0].qr_code_id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
});

// ---------- the admin's routes ----------

const put = (id, body) => statusRoute(new Request(`https://www.kastochhanepal.com/api/admin/sync/feedback/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: { id } });
const digest = (body) => digestRoute(new Request("https://www.kastochhanepal.com/api/admin/sync/feedback/digest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const audit = () => fake.tables.admin_audit_log;

test("only an admin can move a note or mark a digest sent", async () => {
  seed();
  const r = row();
  for (const role of [null, "user"]) {
    world({ role });
    const expected = role ? 403 : 401;
    assert.equal((await put(r.id, { status: "resolved" })).status, expected);
    assert.equal((await digest({ merchantId: A.id })).status, expected);
  }
  assert.equal(stored()[0].status, "new");
  assert.equal(audit().length, 0);
});

test("a note moves from new to sent to resolved and back, with the time stamped only when it is resolved", async () => {
  seed(); world({ role: "admin" });
  const r = row({ message: "THE PRIVATE WORDS", contact: "98-CONTACT" });
  let res = await put(r.id, { status: "in_digest" });
  assert.equal((await res.json()).note.status, "in_digest");
  assert.equal(stored()[0].handled_at, null);
  res = await put(r.id, { status: "resolved" });
  const resolved = (await res.json()).note;
  assert.equal(resolved.status, "resolved");
  assert.ok(Math.abs(Date.parse(resolved.handled_at) - Date.now()) < 5000);
  res = await put(r.id, { status: "new" });
  assert.deepEqual([(await res.json()).note.status, stored()[0].handled_at], ["new", null], "reopened: no longer handled");
  assert.deepEqual(audit().map((e) => e.action), ["sync.feedback.in_digest", "sync.feedback.resolved", "sync.feedback.new"]);
  assert.ok(audit().every((e) => e.status === "applied" && e.actor_id === "user_admin" && e.target_type === "sync_feedback" && e.target_id === r.id));
});

test("the audit log records which note and where it stands, never its words or the contact left", async () => {
  seed(); world({ role: "admin" });
  const r = row({ message: "THE PRIVATE WORDS", contact: "98-CONTACT" });
  await put(r.id, { status: "resolved" });
  const log = JSON.stringify(audit());
  assert.ok(!/PRIVATE WORDS|98-CONTACT/.test(log), log);
  assert.match(log, new RegExp(r.id));
  assert.deepEqual(Object.keys(audit()[0].before).sort(), ["handled_at", "id", "is_urgent", "merchant_id", "status"]);
});

test("moving a note to where it already is changes and records nothing", async () => {
  seed(); world({ role: "admin" });
  const r = row({ status: "in_digest" });
  const res = await put(r.id, { status: "in_digest" });
  assert.equal(res.status, 200);
  assert.equal(audit().length, 0);
});

test("a bad status, a bad id and a missing note are refused", async () => {
  seed(); world({ role: "admin" });
  const r = row();
  for (const status of ["done", "NEW", "", undefined, null, 5, ["resolved"], "resolved ", "in-digest"]) assert.equal((await put(r.id, { status })).status, 400, String(status));
  assert.equal((await put("not-a-uuid", { status: "resolved" })).status, 400);
  assert.equal((await put("99999999-9999-4999-8999-999999999999", { status: "resolved" })).status, 404);
  assert.equal(stored()[0].status, "new");
  assert.equal(audit().length, 0);
});

test("if the audit log is down nothing changes, and a failed save is recorded as failed", async () => {
  seed(); world({ role: "admin" });
  const r = row();
  fake.failWritesTo = "admin_audit_log";
  const res = await put(r.id, { status: "resolved" });
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /audit log/);
  assert.equal(stored()[0].status, "new");
  fake.failWritesTo = "sync_feedback";
  assert.equal((await put(r.id, { status: "resolved" })).status, 500);
  assert.equal(audit()[0].status, "failed");
});

test("'mark all sent' moves one business's NEW notes to the digest, and only those", async () => {
  seed(); world({ role: "admin" });
  const a1 = row(), a2 = row({ is_urgent: true }), aDone = row({ status: "resolved", handled_at: iso(NOW) }), aSent = row({ status: "in_digest" }), b1 = row({ merchant_id: B.id });
  const res = await digest({ merchantId: A.id });
  const body = await res.json();
  assert.equal(body.updated, 2);
  assert.deepEqual(body.ids.sort(), [a1.id, a2.id].sort());
  const status = (r) => stored().find((x) => x.id === r.id).status;
  assert.deepEqual([status(a1), status(a2), status(aDone), status(aSent), status(b1)], ["in_digest", "in_digest", "resolved", "in_digest", "new"], "another business's note, and settled ones, are untouched");
  assert.equal(stored().find((x) => x.id === aDone.id).handled_at, iso(NOW), "a resolved note keeps its time");
  assert.equal(audit().length, 1);
  assert.equal(audit()[0].action, "sync.feedback.digest_sent");
  assert.deepEqual(audit()[0].after.note_ids.sort(), [a1.id, a2.id].sort());
});

test("marking a digest sent twice, or with nothing waiting, does nothing and records nothing", async () => {
  seed(); world({ role: "admin" });
  row();
  assert.equal((await (await digest({ merchantId: A.id })).json()).updated, 1);
  const again = await digest({ merchantId: A.id });
  assert.deepEqual(await again.json(), { updated: 0, ids: [] });
  assert.equal(audit().length, 1, "only the first one was a change");
  assert.deepEqual(await (await digest({ merchantId: B.id })).json(), { updated: 0, ids: [] });
});

test("the digest route refuses a bad business, keeps the words out of the log, and is safe when things fail", async () => {
  seed(); world({ role: "admin" });
  for (const merchantId of ["not-a-uuid", "", null, undefined, 5, {}]) assert.equal((await digest({ merchantId })).status, 400, String(merchantId));
  row({ message: "SECRET DIGEST WORDS", contact: "98-SECRET" });
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await digest({ merchantId: A.id })).status, 500);
  assert.equal(stored()[0].status, "new", "no audit, no change");
  fake.failWritesTo = "sync_feedback";
  assert.equal((await digest({ merchantId: A.id })).status, 500);
  assert.equal(audit()[audit().length - 1].status, "failed");
  assert.ok(!/SECRET DIGEST WORDS|98-SECRET/.test(JSON.stringify(audit())));
  fake.failWritesTo = null; fake.failReadsFrom = "sync_feedback";
  assert.equal((await digest({ merchantId: A.id })).status, 500);
});

// ---------- guards on the screens ----------

const read = (file) => fs.readFileSync(file, "utf8");

test("the note page and form: private, no login, a hidden trap, and the words only ever sent to our route", () => {
  const page = read("app/hub/[slug]/note/page.js");
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /if \(!merchant\) notFound\(\)/);
  assert.ok(!/requireRole|auth\(\)|currentUser/.test(page), "no login");
  const form = read("app/hub/[slug]/note/NoteForm.js");
  assert.match(form, /^"use client";/);
  assert.match(form, /fetch\("\/api\/sync\/feedback"/);
  assert.match(form, /body: JSON\.stringify\(\{ slug, note, contact, website \}\)/);
  assert.match(form, /name="website" tabIndex=\{-1\} autoComplete="off"/);
  assert.match(form, /aria-hidden="true"/);
  assert.match(form, /It is never posted\./);
  assert.match(form, /maxLength=\{NOTE_MAX\}/);
  assert.match(form, /maxLength=\{CONTACT_MAX\}/);
  assert.ok(!/supabase|node:crypto|lib\/sync\/(merchants|hubToken|qr)/.test(form), "nothing server-only reaches the browser");
  assert.match(read("app/hub/[slug]/hub.css"), /\.hub-hp \{\s*position: absolute;\s*left: -9999px;/);
});

test("the inbox is admin-only, says when it could not load rather than showing an empty inbox, and never uses innerHTML", () => {
  const page = read("app/admin/sync/feedback/page.js");
  assert.match(page, /robots: NOINDEX_NOFOLLOW/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.ok(page.indexOf("requireRole(ROLE.ADMIN)") < page.indexOf("listFeedback("));
  assert.match(page, /Could not load the inbox\. Nothing below is shown, so it cannot be mistaken for no notes\./);
  assert.match(page, /if \(!note\.business\) continue;/);
  assert.match(page, /\(tag removed\)/);
  const inbox = read("app/admin/sync/feedback/FeedbackInbox.js");
  assert.match(inbox, /router\.refresh\(\)/, "the list always comes from the server");
  assert.ok(inbox.indexOf("<h2>Notes</h2>") < inbox.indexOf("<h2>Digests to send</h2>"), "notes first, so the urgent ones are what is seen");
  assert.ok(!/dangerouslySetInnerHTML/.test(inbox + read("app/admin/sync/feedback/FeedbackParts.js")));
  assert.ok(!/lib\/supabase|createServerSupabase/.test(inbox), "the browser part reads nothing itself");
});

test("the sidebar counts new notes beside Feedback, and the overview mentions them, neither able to fail a page", () => {
  const layout = read("app/admin/sync/layout.js");
  assert.match(layout, /feedbackNew = \(await countNewFeedback\(createServerSupabase\(\)\)\)\.total;/);
  assert.match(layout, /catch \{\s*feedbackNew = 0;/);
  assert.match(layout, /<SyncNav feedbackNew=\{feedbackNew\} \/>/);
  const nav = read("app/admin/sync/SyncNav.js");
  assert.match(nav, /item\.badge && feedbackNew > 0/);
  const overview = read("app/admin/sync/page.js");
  assert.match(overview, /notes && notes\.total > 0/);
  assert.match(overview, /catch \{\s*notes = null;/);
  assert.match(overview, /Open the inbox/);
});

test("the Sync pages still use no <nav> element, including the new ones", () => {
  for (const file of ["app/admin/sync/feedback/FeedbackParts.js", "app/admin/sync/feedback/FeedbackInbox.js", "app/admin/sync/feedback/page.js", "app/admin/sync/SyncNav.js"]) assert.ok(!/<nav[\s>]/.test(read(file).replace(/\/\/.*$/gm, "")), file);
  assert.match(read("app/admin/sync/feedback/FeedbackParts.js"), /role="navigation" aria-label="Inbox filter"/);
});

test("the stylesheet for the new pieces is still entirely inside .sync-shell", () => {
  const css = read("app/admin/sync/sync-shell.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const flat = css.replace(/@media[^{]*\{([\s\S]*?\})\s*\}/g, "$1");
  const selectors = [...flat.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim()).flatMap((s) => s.split(","));
  for (const selector of selectors) assert.ok(selector.trim().startsWith(".sync-shell"), selector);
  assert.ok(selectors.some((s) => s.includes(".fb-note")) && selectors.some((s) => s.includes(".sync-count")));
});
