// KastoChha Sync, foundation (Stage A, patch 1): the migration's security, the slug
// rules, the signed hub token, and the merchant readers.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FakePostgrest } from "./support/fake-postgrest.js";

const MIGRATION = fs.readFileSync("supabase/migrations/0018_sync_foundation.sql", "utf8");
const SQL = MIGRATION.replace(/--.*$/gm, ""); // the statements, without the comments
const TABLES = ["sync_merchants", "sync_qr_codes", "sync_events", "sync_feedback"];

const { topicSlug } = await import("../lib/slug.js");
const { threadSlugFor, merchantTitle, isValidSlug, normalizeSlug } = await import("../lib/sync/slug.js");
const { signHubToken, verifyHubToken, hubTokenConfigured, HUB_TOKEN_TTL_SECONDS } = await import("../lib/sync/hubToken.js");
const { getMerchantBySlug, getMerchantByTopicSlug, publicMerchant } = await import("../lib/sync/merchants.js");

// ---------- the migration ----------

test("the migration sorts after the last existing one, and is idempotent", () => {
  const files = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  const at = files.indexOf("0018_sync_foundation.sql");
  assert.ok(at > 0, "the migration file is missing");
  assert.ok(files[at - 1] < "0018", "something that sorts before it is numbered 0018 or higher");
  assert.equal(files.filter((f) => f.startsWith("0018_")).length, 1, "two migrations share the number 0018");
  for (const statement of SQL.match(/create (unique )?(table|index)[^;]*;/gi) || []) {
    assert.match(statement, /if not exists/i, `not idempotent: ${statement.slice(0, 60)}`);
  }
  assert.ok(!/\bdrop\b/i.test(SQL), "a drop statement is in the migration");
  const bareConstraints = SQL.match(/alter table[^;]*add constraint/gi) || [];
  assert.equal(bareConstraints.length, 0, "a bare add constraint would fail on the second run");
});

test("every sync table has row level security on, no policy, and no public privileges", () => {
  for (const table of TABLES) {
    assert.match(SQL, new RegExp(`create table if not exists public\\.${table}\\b`), `${table} is not created`);
    assert.match(SQL, new RegExp(`alter table public\\.${table} enable row level security`), `${table} has no row level security`);
    assert.match(SQL, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`), `${table} still grants the public roles access`);
  }
  assert.ok(!/create policy/i.test(SQL), "a policy would open a sync table to the public key");
  assert.ok(!/grant\s/i.test(SQL), "a grant would open a sync table");
});

test("the migration's tables are exactly the ones the test database knows", () => {
  const created = [...SQL.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(created, [...TABLES].sort());
  const fake = new FakePostgrest();
  for (const table of TABLES) assert.ok(Array.isArray(fake.tables[table]), `${table} is missing from tests/support/fake-postgrest.js`);
});

test("addresses are checked in the database, not only in the code", () => {
  assert.match(SQL, /constraint sync_merchants_slug_format\s+check \(slug ~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'/);
  assert.match(SQL, /constraint sync_merchants_topic_slug_format/);
  assert.match(SQL, /create unique index if not exists sync_merchants_slug_key/);
  assert.match(SQL, /create unique index if not exists sync_merchants_topic_slug_key/);
  assert.match(SQL, /create unique index if not exists sync_qr_codes_code_key/);
});

test("the event types are the hub's actions and nothing that could carry a person", () => {
  const types = SQL.match(/event_type in \(([^)]*)\)/s)[1].match(/'([a-z_]+)'/g).map((t) => t.replace(/'/g, "")).sort();
  assert.deepEqual(types, ["google_copy", "hub_ask", "hub_google", "hub_maps", "hub_note", "hub_share", "post_created", "scan"]);
  const eventsTable = SQL.match(/create table if not exists public\.sync_events \(([\s\S]*?)\n\);/)[1];
  for (const personal of ["ip", "user_agent", "email", "name", "phone", "user_id"]) {
    assert.ok(!new RegExp(`^\\s*${personal}\\b`, "m").test(eventsTable), `sync_events has a ${personal} column`);
  }
  assert.match(eventsTable, /octet_length\(metadata::text\) <= 1000/);
});

test("posts get a source column that can only be 'qr' or empty", () => {
  assert.match(SQL, /alter table public\.reviews\s+add column if not exists source text\s+constraint reviews_source_check check \(source is null or source in \('qr'\)\)/);
});

test("feedback is bounded and private by construction", () => {
  const feedback = SQL.match(/create table if not exists public\.sync_feedback \(([\s\S]*?)\n\);/)[1];
  assert.match(feedback, /char_length\(message\) between 1 and 2000/);
  assert.match(feedback, /contact is null or char_length\(contact\) <= 120/);
  assert.match(feedback, /status in \('new', 'in_digest', 'resolved'\)/);
  assert.ok(!/sender_name|user_id/.test(feedback), "feedback stores more about the sender than the optional contact");
});

// ---------- slugs ----------

test("a new business's thread slug is made the way the posts route makes it", () => {
  assert.equal(threadSlugFor({ name: "Himal Brew House", area: "Jhamsikhel" }), "himal-brew-house-jhamsikhel");
  assert.equal(threadSlugFor({ name: "Himal Brew House", area: "Jhamsikhel" }), topicSlug("Himal Brew House, Jhamsikhel"));
  assert.equal(threadSlugFor({ name: "Manny's Tapas Bar", area: "Sanepa" }), "mannys-tapas-bar-sanepa");
  // If the posts route ever stops deriving a thread from topicSlug(title), a café's
  // posts would stop landing in its thread, so make that change impossible to miss.
  assert.match(fs.readFileSync("app/api/reviews/route.js", "utf8"), /topicSlug\(/);
});

test("titles, and the slug rules", () => {
  assert.equal(merchantTitle({ business_name: " Himal Brew House ", area: " Jhamsikhel " }), "Himal Brew House, Jhamsikhel");
  assert.equal(merchantTitle({ business_name: "Himal Brew House" }), "Himal Brew House");
  assert.equal(merchantTitle({ area: "Sanepa" }), "");
  assert.equal(merchantTitle(), "");
  for (const good of ["himal-brew-house", "a", "cafe-2", "x".repeat(80)]) assert.equal(isValidSlug(good), true, good);
  for (const bad of ["", " ", "-abc", "abc-", "a--b", "a b", "a_b", "../x", "a/b", "caf\u00e9", "x".repeat(81), null, undefined]) {
    assert.equal(isValidSlug(bad), false, String(bad));
  }
  assert.equal(isValidSlug("x".repeat(100), 120), true);
  assert.equal(normalizeSlug("  Himal-Brew-HOUSE "), "himal-brew-house");
  assert.equal(isValidSlug("Himal-Brew-House"), true, "URLs arrive in any case");
});

// ---------- the hub token ----------

const SECRET = "a".repeat(64);
const MERCHANT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NOW = Date.UTC(2026, 10, 3, 6, 0, 0);

function withSecret(value, run) {
  const before = process.env.SYNC_HUB_SECRET;
  if (value === undefined) delete process.env.SYNC_HUB_SECRET;
  else process.env.SYNC_HUB_SECRET = value;
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env.SYNC_HUB_SECRET;
    else process.env.SYNC_HUB_SECRET = before;
  }
}

test("a token verifies for its own café, and carries the QR code it came from", () => {
  withSecret(SECRET, () => {
    assert.equal(hubTokenConfigured(), true);
    const token = signHubToken({ merchantId: MERCHANT, qrCodeId: "33333333-3333-4333-8333-333333333333", now: NOW });
    const result = verifyHubToken(token, { merchantId: MERCHANT, now: NOW + 1000 });
    assert.equal(result.ok, true);
    assert.equal(result.merchantId, MERCHANT);
    assert.equal(result.qrCodeId, "33333333-3333-4333-8333-333333333333");
    assert.equal(result.expiresAt, Math.floor(NOW / 1000) + HUB_TOKEN_TTL_SECONDS);
    assert.equal(verifyHubToken(signHubToken({ merchantId: MERCHANT, now: NOW }), { merchantId: MERCHANT, now: NOW }).qrCodeId, null);
  });
});

test("a token is refused for another café, and when no café is named", () => {
  withSecret(SECRET, () => {
    const token = signHubToken({ merchantId: MERCHANT, now: NOW });
    assert.deepEqual(verifyHubToken(token, { merchantId: OTHER, now: NOW }), { ok: false, reason: "wrong-merchant" });
    assert.deepEqual(verifyHubToken(token, { now: NOW }), { ok: false, reason: "merchant-required" });
    assert.deepEqual(verifyHubToken(token, { merchantId: "", now: NOW }), { ok: false, reason: "merchant-required" });
  });
});

test("a token lives six hours, to the second, and never longer than a day", () => {
  withSecret(SECRET, () => {
    const token = signHubToken({ merchantId: MERCHANT, now: NOW });
    const edge = NOW + HUB_TOKEN_TTL_SECONDS * 1000;
    assert.equal(verifyHubToken(token, { merchantId: MERCHANT, now: edge - 1000 }).ok, true);
    assert.deepEqual(verifyHubToken(token, { merchantId: MERCHANT, now: edge }), { ok: false, reason: "expired" });
    assert.deepEqual(verifyHubToken(token, { merchantId: MERCHANT, now: edge + 86_400_000 }), { ok: false, reason: "expired" });
    const long = signHubToken({ merchantId: MERCHANT, ttlSeconds: 10 * 86_400, now: NOW });
    assert.equal(verifyHubToken(long, { merchantId: MERCHANT, now: NOW }).expiresAt, Math.floor(NOW / 1000) + 86_400);
    const short = signHubToken({ merchantId: MERCHANT, ttlSeconds: -50, now: NOW });
    assert.equal(verifyHubToken(short, { merchantId: MERCHANT, now: NOW }).expiresAt, Math.floor(NOW / 1000) + 1);
  });
});

test("a token cannot be edited, re-signed with another key, or have its signature swapped", () => {
  const forged = withSecret("b".repeat(64), () => signHubToken({ merchantId: MERCHANT, now: NOW }));
  withSecret(SECRET, () => {
    const token = signHubToken({ merchantId: MERCHANT, now: NOW });
    const [body, sig] = token.split(".");
    const edited = Buffer.from(JSON.stringify({ m: OTHER, e: Math.floor(NOW / 1000) + 3600 })).toString("base64url");
    const longer = Buffer.from(JSON.stringify({ m: MERCHANT, e: Math.floor(NOW / 1000) + 90_000 })).toString("base64url");
    for (const bad of [`${edited}.${sig}`, `${longer}.${sig}`, `${body}.${sig.slice(0, -2)}AA`, `${body}.`, forged]) {
      assert.deepEqual(verifyHubToken(bad, { merchantId: bad === `${edited}.${sig}` ? OTHER : MERCHANT, now: NOW }), { ok: false, reason: bad.endsWith(".") ? "malformed" : "bad-signature" }, bad.slice(0, 24));
    }
    const otherToken = signHubToken({ merchantId: OTHER, now: NOW });
    assert.equal(verifyHubToken(`${body}.${otherToken.split(".")[1]}`, { merchantId: MERCHANT, now: NOW }).ok, false);
  });
});

test("garbage is refused, never thrown on", () => {
  withSecret(SECRET, () => {
    const long = "x".repeat(401);
    for (const junk of ["", "abc", "a.b.c", ".", "..", "x.", ".y", long, `${long}.${long}`, null, undefined, 123, {}, [], "\u0000.\u0000", "eyJ9.eyJ9"]) {
      const result = verifyHubToken(junk, { merchantId: MERCHANT, now: NOW });
      assert.equal(result.ok, false, String(junk).slice(0, 20));
      assert.ok(["malformed", "bad-signature"].includes(result.reason), `${String(junk).slice(0, 20)}: ${result.reason}`);
    }
  });
});

test("it fails closed with no secret, or one that is too short", () => {
  for (const value of [undefined, "", "short", "a".repeat(31)]) {
    withSecret(value, () => {
      assert.equal(hubTokenConfigured(), false);
      assert.throws(() => signHubToken({ merchantId: MERCHANT }), /SYNC_HUB_SECRET/);
      assert.deepEqual(verifyHubToken("anything.here", { merchantId: MERCHANT }), { ok: false, reason: "not-configured" });
    });
  }
  const token = withSecret(SECRET, () => signHubToken({ merchantId: MERCHANT, now: NOW }));
  withSecret(undefined, () => assert.equal(verifyHubToken(token, { merchantId: MERCHANT, now: NOW }).ok, false));
  withSecret("a".repeat(32), () => assert.equal(hubTokenConfigured(), true));
  withSecret(SECRET, () => assert.throws(() => signHubToken({}), /merchantId/));
});

test("what is inside a token is only the café, the QR code and an expiry", () => {
  withSecret(SECRET, () => {
    const token = signHubToken({ merchantId: MERCHANT, qrCodeId: OTHER, now: NOW });
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    assert.deepEqual(Object.keys(payload).sort(), ["e", "m", "q"]);
    assert.ok(!token.includes(SECRET));
    assert.notEqual(token, signHubToken({ merchantId: OTHER, now: NOW }));
    assert.equal(token, signHubToken({ merchantId: MERCHANT, qrCodeId: OTHER, now: NOW }));
    assert.ok(token.length < 400);
  });
  assert.match(fs.readFileSync("lib/sync/hubToken.js", "utf8"), /timingSafeEqual/);
});

// ---------- the merchant readers ----------

const fake = new FakePostgrest();
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const savedEnv = {};
let savedConsoleError;

before(async () => {
  await fake.listen();
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  savedConsoleError = console.error;
});

after(async () => {
  console.error = savedConsoleError;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await fake.close();
});

function seed() {
  fake.reset();
  fake.tables.sync_merchants.push(
    { id: MERCHANT, slug: "himal-brew-house", topic_slug: "himal-brew-house-jhamsikhel", business_name: "Himal Brew House", area: "Jhamsikhel", business_kind: "cafe", category: "Food", about: "A calm caf\u00e9.", google_place_id: "ChIJexample", google_review_url: "https://search.google.com/local/writereview?placeid=ChIJexample", google_maps_url: "https://maps.google.com/?cid=1", owner_user_id: "user_owner_1", status: "active" },
    { id: OTHER, slug: "kirtipur-cup", topic_slug: "kirtipur-cup-kirtipur", business_name: "Kirtipur Cup", area: "Kirtipur", business_kind: "cafe", category: "Food", about: null, google_place_id: null, google_review_url: null, google_maps_url: null, owner_user_id: null, status: "cancelled" }
  );
}

test("a business is found by its own address and by its thread's address, in any case", async () => {
  seed();
  const bySlug = await getMerchantBySlug("himal-brew-house");
  assert.equal(bySlug.id, MERCHANT);
  assert.equal((await getMerchantBySlug("  Himal-Brew-HOUSE ")).id, MERCHANT);
  assert.equal((await getMerchantByTopicSlug("himal-brew-house-jhamsikhel")).business_name, "Himal Brew House");
  assert.equal((await getMerchantByTopicSlug("HIMAL-BREW-HOUSE-JHAMSIKHEL")).id, MERCHANT);
  assert.equal(await getMerchantBySlug("no-such-cafe"), null);
  assert.equal(await getMerchantByTopicSlug("himal-brew-house"), null, "the two addresses are different columns");
});

test("a cancelled business is not found unless asked for", async () => {
  seed();
  assert.equal(await getMerchantBySlug("kirtipur-cup"), null);
  assert.equal(await getMerchantByTopicSlug("kirtipur-cup-kirtipur"), null);
  assert.equal((await getMerchantBySlug("kirtipur-cup", { includeCancelled: true })).status, "cancelled");
  assert.equal((await getMerchantByTopicSlug("kirtipur-cup-kirtipur", { includeCancelled: true })).id, OTHER);
});

test("a bad address never reaches the database", async () => {
  seed();
  const before = fake.requests.length;
  for (const bad of ["", " ", "a b", "../etc", "x".repeat(200), null, undefined, "a%20b", "caf\u00e9"]) {
    assert.equal(await getMerchantBySlug(bad), null, String(bad));
    assert.equal(await getMerchantByTopicSlug(bad), null, String(bad));
  }
  assert.equal(fake.requests.length, before);
});

test("an unreachable database, or a table that does not exist yet, gives null and never throws", async () => {
  seed();
  console.error = () => {};
  fake.failReadsFrom = "sync_merchants";
  assert.equal(await getMerchantBySlug("himal-brew-house"), null);
  assert.equal(await getMerchantByTopicSlug("himal-brew-house-jhamsikhel"), null);
  fake.failReadsFrom = null;
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal(await getMerchantBySlug("himal-brew-house"), null, "a missing service key is an error the page must survive");
  process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  console.error = savedConsoleError;
});

test("what goes to a browser never includes the owner's account or internal ids", async () => {
  seed();
  const merchant = await getMerchantBySlug("himal-brew-house");
  const shown = publicMerchant(merchant);
  assert.deepEqual(Object.keys(shown).sort(), ["about", "area", "category", "googleMapsUrl", "googleReviewUrl", "hasOwner", "kind", "kindName", "name", "slug", "threadTitle", "topicSlug"]);
  assert.equal(shown.hasOwner, true);
  const text = JSON.stringify(shown);
  assert.ok(!text.includes("user_owner_1") && !text.includes(MERCHANT), "an owner account or internal id leaked");
  assert.ok(!/place_?id/i.test(Object.keys(shown).join(" ")), "the place id is not a field of its own");
  assert.equal(publicMerchant(null), null);
  assert.equal(publicMerchant({ ...merchant, owner_user_id: null }).hasOwner, false);
  assert.equal(publicMerchant({ ...merchant, about: null }).about, "");
});

// ---------- guards ----------

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("no browser code can import the server-only sync helpers", () => {
  const roots = ["app", "components"].filter((dir) => fs.existsSync(dir));
  const clientFiles = roots.flatMap((dir) => sourceFiles(dir)).filter((f) => /^\s*["']use client["']/.test(fs.readFileSync(f, "utf8")));
  assert.ok(clientFiles.length > 0, "found no client components to check");
  for (const file of clientFiles) {
    assert.ok(!/lib\/sync\/(hubToken|merchants|threads)/.test(fs.readFileSync(file, "utf8")), `${file} imports a server-only sync module, which holds a secret or the service role`);
  }
  for (const file of sourceFiles("lib/sync")) {
    assert.ok(!/from\s+["'](\.\.\/)+app\//.test(fs.readFileSync(file, "utf8")), `${file} reaches into app/`);
  }
});

test("the new secret is documented where the others are", () => {
  const example = fs.readFileSync(".env.example", "utf8");
  assert.match(example, /^SYNC_HUB_SECRET=$/m);
  assert.match(example, /at least 32 characters/i);
});
