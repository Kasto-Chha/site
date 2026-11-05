// The website badge, connected to Sync. The real badge script runs in a simulated web page, talking to
// the real check route and the real tap route over a fake database, so a click on the badge is traced
// all the way to the event it leaves behind.

process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { GET: checkRoute, OPTIONS: checkOptions } = await import("../app/api/badge/check/route.js");
const { POST: tapRoute } = await import("../app/api/sync/event/route.js");
const { badgeSnippet, badgeCheckAnswer, badgeStats, BADGE_SITE_DEFAULT } = await import("../lib/sync/badge.js");
const { EVENT_TYPES, BADGE_EVENTS, PUBLIC_EVENTS, HUB_CLICK_EVENTS, PAGE_CLICK_EVENTS } = await import("../lib/sync/qr.js");
const { createServerSupabase } = await import("../lib/supabase/server.js");

const WIDGET = fs.readFileSync("public/badge-widget.js", "utf8");
// A real site loads the file with <script src>, so its own usage example (which contains the text
// </script>, inside a comment) is harmless. Pasted inline into a test page it would end the script
// early, so it is escaped there.
const INLINE = WIDGET.replace(/<\/script>/g, "<\\/script>");
const SITE = "https://www.kastochhanepal.com";

const fake = new FakePostgrest();
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const saved = {};
let savedConsoleError, savedConsoleWarn;

before(async () => {
  await fake.listen();
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  savedConsoleError = console.error;
  savedConsoleWarn = console.warn;
});

after(async () => {
  console.error = savedConsoleError;
  console.warn = savedConsoleWarn;
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await fake.close();
});

function world({ upstash = "on" } = {}) {
  globalThis.__KC_TEST__ = { userId: null, roles: {}, cookies: {}, revalidatedPaths: [], upstash, redis: {}, seenIdentifiers: [] };
}

beforeEach(() => {
  fake.reset();
  console.error = () => {};
  console.warn = () => {};
  world();
});

const M1 = "11111111-1111-4111-8111-111111111111";
function merchant(o = {}) {
  const row = { id: M1, slug: "himal-brew-house", topic_slug: "himal-brew-house-jhamsikhel", business_name: "Himal Brew House", area: "Jhamsikhel", business_kind: "cafe", kind_label: null, category: "Food", status: "active", thread_title: "Himal Brew House, Jhamsikhel", owner_user_id: "user_owner_secret", google_review_url: "https://g.page/r/secret/review", ...o };
  fake.tables.sync_merchants.push(row);
  return row;
}
const events = (type) => fake.tables.sync_events.filter((e) => !type || e.event_type === type);

// ---------- what the badge may report ----------

test("the badge reports three things, which the database and the code agree on", () => {
  assert.deepEqual(BADGE_EVENTS, ["badge_open", "badge_share", "badge_ask"]);
  for (const type of BADGE_EVENTS) assert.ok(EVENT_TYPES.includes(type), type);
  assert.deepEqual(PUBLIC_EVENTS, [...HUB_CLICK_EVENTS, ...PAGE_CLICK_EVENTS, ...BADGE_EVENTS]);
  for (const forbidden of ["scan", "post_created"]) assert.ok(!PUBLIC_EVENTS.includes(forbidden), `${forbidden} must stay server-only`);
});

test("the migration adds the badge events, drops the old public list, and can be run again", () => {
  const sql = fs.readFileSync("supabase/migrations/0022_sync_badge_events.sql", "utf8").replace(/--.*$/gm, "");
  assert.match(sql, /drop constraint if exists sync_events_type_check;/);
  assert.match(sql, /add constraint sync_events_type_check check \(event_type in \(/);
  const listed = sql.match(/event_type in \(([^)]*)\)/s)[1].match(/'([a-z_]+)'/g).map((t) => t.replace(/'/g, "")).sort();
  assert.deepEqual(listed, [...EVENT_TYPES].sort(), "the database accepts exactly what the code knows");
  assert.match(sql, /to_regclass\('public\.badge_businesses'\) is not null/, "safe when the old table was never created");
  assert.match(sql, /drop policy if exists "public read" on public\.badge_businesses/);
  assert.ok(!/drop table|delete from|truncate/i.test(sql), "the old table and its rows are left for you to remove by hand");
  const files = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  assert.ok(files.indexOf("0022_sync_badge_events.sql") > files.indexOf("0021_sync_thread_title.sql"));
});

// ---------- the snippet and the answer ----------

test("the snippet is one line, names the business by its address, and points at the real site", () => {
  assert.equal(badgeSnippet("https://www.kastochhanepal.com", "himal-brew-house"), '<script src="https://www.kastochhanepal.com/badge-widget.js" data-business="himal-brew-house" async></script>');
  assert.equal(badgeSnippet("https://www.kastochhanepal.com/", "x"), '<script src="https://www.kastochhanepal.com/badge-widget.js" data-business="x" async></script>');
  assert.match(badgeSnippet("", "x"), new RegExp(`src="${BADGE_SITE_DEFAULT}/badge-widget.js"`));
  assert.match(badgeSnippet(undefined, "x"), /src="https:\/\/www\.kastochhanepal\.com\/badge-widget\.js"/, "never blank, never a preview address by accident");
  assert.ok(!badgeSnippet("https://a.test", "himal-brew-house").includes("\n"));
});

test("a quote in either part cannot break out of the snippet", () => {
  const snippet = badgeSnippet('https://a.test/"><script>x</script>', 'a" onload="x');
  assert.ok(!snippet.includes('"><script>'));
  assert.equal((snippet.match(/<script/g) || []).length, 1);
  assert.ok(snippet.includes("&quot;"));
});

test("the answer carries a name and a thread, and nothing a stranger shouldn't have", () => {
  assert.deepEqual(badgeCheckAnswer(merchant()), { allowed: true, name: "Himal Brew House", thread: "/discussions/himal-brew-house-jhamsikhel" });
  assert.deepEqual(badgeCheckAnswer(null), { allowed: false });
  assert.deepEqual(badgeCheckAnswer(undefined), { allowed: false });
  const text = JSON.stringify(badgeCheckAnswer(fake.tables.sync_merchants[0]));
  assert.ok(!/user_owner_secret|g\.page|11111111|category|status/.test(text), text);
});

test("the counts are totals and last seven days, for the badge's three events only", async () => {
  merchant();
  const now = Date.UTC(2026, 10, 4, 12, 0, 0);
  const at = (d) => new Date(now - d * 86400000).toISOString();
  fake.tables.sync_events.push(
    { merchant_id: M1, event_type: "badge_open", created_at: at(1) }, { merchant_id: M1, event_type: "badge_open", created_at: at(3) }, { merchant_id: M1, event_type: "badge_open", created_at: at(30) },
    { merchant_id: M1, event_type: "badge_share", created_at: at(2) }, { merchant_id: M1, event_type: "scan", created_at: at(1) }, { merchant_id: M1, event_type: "hub_share", created_at: at(1) },
    { merchant_id: "other", event_type: "badge_ask", created_at: at(1) }
  );
  assert.deepEqual(await badgeStats(createServerSupabase(), M1, { now }), { badge_open: { total: 3, week: 2 }, badge_share: { total: 1, week: 1 }, badge_ask: { total: 0, week: 0 } });
  fake.failReadsFrom = "sync_events";
  await assert.rejects(() => badgeStats(createServerSupabase(), M1));
});

// ---------- the check route ----------

const ask = (business, { ip = "203.0.113.7" } = {}) =>
  checkRoute(new Request(`${SITE}/api/badge/check${business === undefined ? "" : `?business=${encodeURIComponent(business)}`}`, { headers: { "x-vercel-forwarded-for": ip } }));

test("a business on Sync is allowed, by its address, in any case", async () => {
  merchant();
  for (const form of ["himal-brew-house", "HIMAL-BREW-HOUSE", "  Himal-Brew-House  "]) {
    const res = await ask(form);
    assert.equal(res.status, 200, form);
    assert.deepEqual(await res.json(), { allowed: true, name: "Himal Brew House", thread: "/discussions/himal-brew-house-jhamsikhel" }, form);
  }
});

test("a business whose tag was removed, an unknown one and a name are not allowed", async () => {
  merchant({ status: "cancelled" });
  merchant({ id: "22222222-2222-4222-8222-222222222222", slug: "momo-hub", topic_slug: "momo-hub-pulchowk", business_name: "Momo Hub" });
  for (const form of ["himal-brew-house", "no-such-cafe", "Momo Hub", "momo hub", "Himal Brew House"]) {
    const res = await ask(form);
    assert.equal(res.status, 200, form);
    assert.deepEqual(await res.json(), { allowed: false }, form);
  }
  assert.equal((await (await ask("momo-hub")).json()).allowed, true);
});

test("an address that cannot be one never reaches the database", async () => {
  merchant();
  const before = fake.requests.length;
  for (const bad of ["a b", "../x", "x'; drop table sync_merchants;--", "a".repeat(200), "-x", "x--y", "<script>", "%00", "a/b"]) assert.deepEqual(await (await ask(bad)).json(), { allowed: false }, bad);
  assert.equal(fake.requests.length, before);
});

test("a missing name is a 400, and every answer carries the cross-site headers", async () => {
  merchant();
  for (const res of [await ask(undefined), await ask(""), await ask("himal-brew-house"), await ask("nope"), await ask("bad name")]) {
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
  }
  assert.equal((await ask(undefined)).status, 400);
  assert.equal((await ask("   ")).status, 400);
  const pre = await checkOptions();
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-methods"), "GET, OPTIONS");
});

test("an answer is cached for a minute at the edge, a no for half that, and a refusal or an error not at all", async () => {
  merchant();
  assert.equal((await ask("himal-brew-house")).headers.get("cache-control"), "public, max-age=0, s-maxage=60");
  assert.equal((await ask("no-such")).headers.get("cache-control"), "public, max-age=0, s-maxage=30");
  assert.equal((await ask("bad name")).headers.get("cache-control"), "public, max-age=0, s-maxage=30");
  assert.equal((await ask(undefined)).headers.get("cache-control"), "no-store");
});

test("if the database cannot be read, there is no badge, and no error page", async () => {
  merchant();
  fake.failReadsFrom = "sync_merchants";
  const res = await ask("himal-brew-house");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { allowed: false });
});

test("guessing is limited per address: the 121st in a minute is refused, another address is not", async () => {
  merchant();
  // All sent at once, so they fall in the same minute however slow each answer is (sent one after another on a slow
  // machine, the minute could roll over part-way and let more through, which proves nothing about the limit).
  const results = await Promise.all(Array.from({ length: 125 }, (_, i) => ask(`guess-${i}`, { ip: "198.51.100.9" })));
  const ok = results.filter((res) => res.status === 200).length;
  const limited = results.find((res) => res.status === 429);
  assert.equal(ok, 120);
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { allowed: false, error: "Too many requests." });
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
  assert.equal(limited.headers.get("access-control-allow-origin"), "*", "a refusal is still readable by the badge");
  assert.equal((await ask("himal-brew-house", { ip: "198.51.100.10" })).status, 200);
  world({ upstash: "error" });
  assert.equal((await ask("himal-brew-house", { ip: "198.51.100.9" })).status, 200, "a limiter outage never hides a badge");
});

test("nothing reads the old approved-names table any more", () => {
  for (const file of ["app/api/badge/check/route.js", "public/badge-widget.js", "lib/sync/badge.js"]) assert.ok(!fs.readFileSync(file, "utf8").includes("badge_businesses"), file);
  const code = fs.readFileSync("app/api/badge/check/route.js", "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /getMerchantBySlug\(business\)/);
  assert.ok(code.indexOf('checkRateLimit("badge"') < code.indexOf("getMerchantBySlug("), "limited before any database work");
  assert.match(fs.readFileSync("lib/ratelimit.js", "utf8"), /badge: \{ tokens: 120, window: "1 m" \}/);
});

// ---------- the tap route, for the badge ----------

const tap = (body, { type = "text/plain;charset=UTF-8", ip = "203.0.113.7" } = {}) =>
  tapRoute(new Request(`${SITE}/api/sync/event`, { method: "POST", headers: { "content-type": type, "x-vercel-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body) }));

test("each of the badge's events is recorded against the business, from a plain-text body", async () => {
  merchant();
  for (const type of BADGE_EVENTS) assert.equal((await tap({ slug: "himal-brew-house", type })).status, 204, type);
  assert.deepEqual(events().map((e) => e.event_type), BADGE_EVENTS);
  assert.ok(events().every((e) => e.merchant_id === M1 && e.qr_code_id === null));
});

test("a badge click is never credited to a table, even if it names one", async () => {
  merchant();
  fake.tables.sync_qr_codes.push({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", merchant_id: M1, code: "abc3k9xq", label: "Table 1", active: true });
  await tap({ slug: "himal-brew-house", type: "badge_open", code: "abc3k9xq" });
  await tap({ slug: "himal-brew-house", type: "hub_share", code: "abc3k9xq" });
  assert.equal(events()[0].qr_code_id, null, "a badge is on a website, not on a table");
  assert.equal(events()[1].qr_code_id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "the hub still credits its table");
});

test("the tap route still refuses what a visitor must never be able to record", async () => {
  merchant();
  for (const type of ["scan", "post_created", "badge_view", "BADGE_OPEN", ""]) assert.equal((await tap({ slug: "himal-brew-house", type })).status, 400, type);
  assert.equal((await tap({ slug: "no-such", type: "badge_open" })).status, 404);
  merchant({ id: "33333333-3333-4333-8333-333333333333", slug: "gone", topic_slug: "gone-x", status: "cancelled" });
  assert.equal((await tap({ slug: "gone", type: "badge_open" })).status, 404, "a removed business counts nothing");
  assert.equal(events().length, 0);
});

// ---------- the badge script, in a simulated page ----------

// Wait until the page has finished talking to the server, however long that takes. This used to wait a fixed
// 80 ms, which was enough on a fast machine and not on a slow one (a test that looks for the badge before it has
// been drawn fails for nothing). The page's own requests are counted, and the wait ends once none is in flight and
// it has stayed that way for three short checks, so the page's reaction to the last answer has also finished.
let inflight = 0;
const settle = async () => {
  const started = Date.now();
  let quiet = 0;
  while (quiet < 3) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    quiet = inflight === 0 ? quiet + 1 : 0;
    if (Date.now() - started > 15000) throw new Error("the page never finished its requests");
  }
};

// A page on someone else's website with the one-line snippet on it. `reply` can stand in for the
// server's answers to prove how the badge handles an answer that is wrong.
async function visit({ attr = `data-business="himal-brew-house"`, reply, extraScripts = "", fetchBroken = false, noFetch = false } = {}) {
  const calls = [];
  const logs = [];
  const route = async (url, options = {}) => {
    if (url.includes("/api/badge/check")) return checkRoute(new Request(url));
    if (url.includes("/api/sync/event")) return tapRoute(new Request(url, { method: options.method, headers: options.headers, body: options.body }));
    throw new Error(`the badge asked for something unexpected: ${url}`);
  };
  const dom = new JSDOM(`<!doctype html><html><body><h1>A business's own website</h1><script ${attr}>${INLINE}</script>${extraScripts ? `<script ${attr}>${INLINE}</script>` : ""}</body></html>`, {
    url: "https://their-site.example/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      if (!noFetch) {
        window.fetch = async (url, options = {}) => {
          inflight += 1;
          try {
            calls.push({ url: String(url), options });
            if (fetchBroken) throw new TypeError("Failed to fetch");
            if (reply && String(url).includes("/api/badge/check")) return await reply(String(url));
            return await route(String(url), options);
          } finally {
            inflight -= 1;
          }
        };
      }
      window.console.error = (...a) => logs.push(a.join(" "));
    }
  });
  await settle();
  return { dom, document: dom.window.document, window: dom.window, calls, logs };
}
const button = (v) => v.document.querySelector(".kc-badge-btn");
const eventCalls = (v) => v.calls.filter((c) => c.url.endsWith("/api/sync/event"));

test("a business on Sync gets the red button, announced properly", async () => {
  merchant();
  const v = await visit();
  assert.ok(button(v));
  assert.equal(button(v).textContent.trim(), "Ask KastoChha");
  assert.equal(button(v).getAttribute("aria-label"), "Ask or share on KastoChha about Himal Brew House");
  assert.equal(v.logs.length, 0);
});

test("'Share' goes to the business's own thread, where the box is, and 'Ask' to the chat", async () => {
  merchant();
  const v = await visit();
  const links = [...v.document.querySelectorAll(".kc-badge-option")];
  assert.equal(links.length, 2);
  assert.equal(links[0].getAttribute("href"), "https://www.kastochhanepal.com/discussions/himal-brew-house-jhamsikhel#share");
  assert.equal(links[1].getAttribute("href"), "https://www.kastochhanepal.com/chat?q=Himal%20Brew%20House");
  assert.ok(links.every((a) => a.target === "_blank" && a.rel === "noopener noreferrer"));
  assert.ok(!links[0].href.includes("?share="), "the old home-page share box, which would split the thread, is not used");
});

test("the popup opens, and closes with the button, the cross or Escape, and the click-outside", async () => {
  merchant();
  const v = await visit();
  const overlay = v.document.querySelector(".kc-badge-overlay");
  assert.ok(!overlay.classList.contains("kc-open"));
  button(v).click();
  assert.ok(overlay.classList.contains("kc-open"));
  v.document.dispatchEvent(new v.window.KeyboardEvent("keydown", { key: "Escape" }));
  assert.ok(!overlay.classList.contains("kc-open"));
  button(v).click(); v.document.querySelector(".kc-badge-close").click();
  assert.ok(!overlay.classList.contains("kc-open"));
  button(v).click(); overlay.click();
  assert.ok(!overlay.classList.contains("kc-open"));
});

test("nothing appears for a business that is not on Sync, one whose tag was removed, or a name", async () => {
  merchant({ status: "cancelled" });
  merchant({ id: "22222222-2222-4222-8222-222222222222", slug: "momo-hub", topic_slug: "momo-hub-pulchowk", business_name: "Momo Hub" });
  for (const attr of [`data-business="himal-brew-house"`, `data-business="no-such-cafe"`, `data-business="elsewhere"`]) {
    const v = await visit({ attr });
    assert.equal(button(v), null, attr);
    assert.equal(v.document.querySelector(".kc-badge-overlay"), null, attr);
  }
  assert.ok(button(await visit({ attr: `data-business="momo-hub"` })), "the control: a tagged business does appear");
});

test("capitals in the snippet do not matter", async () => {
  merchant();
  assert.ok(button(await visit({ attr: `data-business="Himal-Brew-House"` })));
  assert.ok(button(await visit({ attr: `data-business="  HIMAL-BREW-HOUSE "` })));
});

test("a name instead of an address says so clearly in the console, and asks the server nothing", async () => {
  merchant();
  for (const attr of [`data-business="Himal Brew House"`, `data-business="himal brew house"`, `data-business="Tom's Bar"`, `data-business="a--b"`, `data-business="${"a".repeat(81)}"`]) {
    const v = await visit({ attr });
    assert.equal(button(v), null, attr);
    assert.equal(v.calls.length, 0, `${attr} must not even ask`);
    assert.ok(v.logs.some((l) => /must be the business's KastoChha address/.test(l)), attr);
  }
});

test("a missing or empty snippet says so, and does nothing", async () => {
  for (const attr of ["", `data-business=""`, `data-business="   "`]) {
    const v = await visit({ attr });
    assert.equal(button(v), null);
    assert.equal(v.calls.length, 0);
    assert.ok(v.logs.some((l) => /missing required data-business/.test(l)));
  }
});

test("a database that is down, or no network at all, means no button and no error on their site", async () => {
  merchant();
  fake.failReadsFrom = "sync_merchants";
  const down = await visit();
  assert.equal(button(down), null);
  assert.equal(down.logs.length, 0);
  fake.failReadsFrom = null;
  const offline = await visit({ fetchBroken: true });
  assert.equal(button(offline), null);
  assert.equal(offline.logs.length, 0);
  const old = await visit({ noFetch: true });
  assert.equal(button(old), null, "a browser with no fetch just shows nothing");
});

test("an answer that is wrong or tampered with never puts a button, or a link, on the page", async () => {
  merchant();
  const answers = [
    { allowed: true, name: "X", thread: "javascript:alert(1)" },
    { allowed: true, name: "X", thread: "//evil.example/x" },
    { allowed: true, name: "X", thread: "https://evil.example/discussions/x" },
    { allowed: true, name: "X", thread: "/discussions/../admin" },
    { allowed: true, name: "X", thread: "/admin" },
    { allowed: true, name: "X", thread: "/discussions/UPPER" },
    { allowed: true, name: "X", thread: "/discussions/" },
    { allowed: true, name: 5, thread: "/discussions/ok" },
    { allowed: true, name: "", thread: "/discussions/ok" },
    { allowed: true, name: "   ", thread: "/discussions/ok" },
    { allowed: true, name: "X".repeat(201), thread: "/discussions/ok" },
    { allowed: true, thread: "/discussions/ok" },
    { allowed: true, name: "X" },
    { allowed: "yes", name: "X", thread: "/discussions/ok" },
    { allowed: 1, name: "X", thread: "/discussions/ok" },
    { allowed: false, name: "X", thread: "/discussions/ok" },
    {}, null, [], "allowed"
  ];
  for (const answer of answers) {
    const v = await visit({ reply: async () => Response.json(answer) });
    assert.equal(button(v), null, JSON.stringify(answer));
  }
  const notJson = await visit({ reply: async () => new Response("<html>oops</html>", { status: 200 }) });
  assert.equal(button(notJson), null);
  const good = await visit({ reply: async () => Response.json({ allowed: true, name: "X", thread: "/discussions/ok-slug" }) });
  assert.ok(button(good), "the control: a well-formed answer does mount");
});

test("a name made of HTML is shown as plain text, never run, and never read as markup", async () => {
  merchant({ business_name: `<img src=x onerror="window.pwned=1"> & "Co"` });
  const v = await visit();
  assert.ok(button(v));
  assert.equal(v.document.querySelector(".kc-name").textContent, `<img src=x onerror="window.pwned=1"> & "Co"`);
  assert.equal(v.document.querySelector(".kc-badge-card img[src='x']"), null);
  assert.equal(v.document.querySelectorAll(".kc-badge-card img").length, 1, "only the logo");
  assert.equal(v.window.pwned, undefined);
  assert.equal(button(v).getAttribute("aria-label"), `Ask or share on KastoChha about <img src=x onerror="window.pwned=1"> & "Co"`);
  assert.ok(v.document.querySelectorAll(".kc-badge-option")[1].getAttribute("href").startsWith("https://www.kastochhanepal.com/chat?q=%3Cimg%20src%3Dx"));
});

test("including the snippet twice gives one button", async () => {
  merchant();
  const v = await visit({ extraScripts: "again" });
  assert.equal(v.document.querySelectorAll(".kc-badge-btn").length, 1);
  assert.equal(v.document.querySelectorAll(".kc-badge-overlay").length, 1);
});

test("on load it asks only whether to show, and reports nothing about the visitor", async () => {
  merchant();
  const v = await visit();
  assert.equal(v.calls.length, 1);
  assert.equal(v.calls[0].url, "https://www.kastochhanepal.com/api/badge/check?business=himal-brew-house");
  assert.deepEqual(v.calls[0].options, {}, "no cookies, no headers, no body");
  assert.equal(events().length, 0, "nothing is counted until the popup is opened");
});

test("opening the popup is counted once per page view, and the event is stored", async () => {
  merchant();
  const v = await visit();
  button(v).click();
  await settle();
  button(v).click(); button(v).click();
  await settle();
  assert.equal(eventCalls(v).length, 1);
  assert.equal(events().length, 1);
  assert.deepEqual({ type: events()[0].event_type, merchant: events()[0].merchant_id, qr: events()[0].qr_code_id }, { type: "badge_open", merchant: M1, qr: null });
});

test("a click on each link is counted, and reaches the database through the real route", async () => {
  merchant();
  const v = await visit();
  button(v).click();
  v.document.querySelector(".kc-share").click();
  v.document.querySelector(".kc-ask").click();
  await settle();
  assert.deepEqual(events().map((e) => e.event_type).sort(), ["badge_ask", "badge_open", "badge_share"]);
  assert.ok(events().every((e) => e.merchant_id === M1));
  v.document.querySelector(".kc-share").click();
  await settle();
  assert.equal(events("badge_share").length, 2, "each click on a link counts");
});

test("what is sent is only the business and the event, in a request that cannot leak a cookie or break a page", async () => {
  merchant();
  const v = await visit();
  button(v).click();
  const [call] = eventCalls(v);
  assert.equal(call.url, "https://www.kastochhanepal.com/api/sync/event");
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.mode, "no-cors", "no cross-site pre-check and no error in the host site's console");
  assert.equal(call.options.credentials, "omit", "no cookies sent");
  assert.equal(call.options.keepalive, true, "it survives the visitor leaving the page");
  assert.equal(call.options.headers["Content-Type"], "text/plain;charset=UTF-8");
  assert.deepEqual(JSON.parse(call.options.body), { slug: "himal-brew-house", type: "badge_open" });
  await settle();
});

test("if counting fails, the popup and the links still work", async () => {
  merchant();
  const v = await visit();
  v.window.fetch = async () => { throw new TypeError("Failed to fetch"); };
  assert.doesNotThrow(() => button(v).click());
  assert.ok(v.document.querySelector(".kc-badge-overlay").classList.contains("kc-open"));
  assert.doesNotThrow(() => v.document.querySelector(".kc-share").click());
  v.window.fetch = () => { throw new Error("sync throw"); };
  assert.doesNotThrow(() => v.document.querySelector(".kc-ask").click());
  v.window.fetch = undefined;
  assert.doesNotThrow(() => v.document.querySelector(".kc-ask").click());
  await settle();
});

test("the badge only ever talks to KastoChha's own two endpoints", async () => {
  merchant();
  const v = await visit();
  button(v).click(); v.document.querySelector(".kc-share").click(); v.document.querySelector(".kc-ask").click();
  await settle();
  const allowed = new Set(["https://www.kastochhanepal.com/api/badge/check?business=himal-brew-house", "https://www.kastochhanepal.com/api/sync/event"]);
  assert.ok(v.calls.every((c) => allowed.has(c.url)), v.calls.map((c) => c.url).join(", "));
});

test("it leaves nothing behind on the host page but its own prefixed pieces", async () => {
  merchant();
  const v = await visit();
  const before = ["h1", "script"].map((s) => v.document.querySelectorAll(s).length);
  assert.equal(before[0], 1);
  const added = [...v.document.body.children].filter((el) => !["H1", "SCRIPT"].includes(el.tagName));
  assert.deepEqual(added.map((el) => el.className), ["kc-badge-btn", "kc-badge-overlay"]);
  const css = [...v.document.head.querySelectorAll("style")].map((s) => s.textContent).join("");
  assert.ok(css.length > 500);
  for (const selector of css.match(/[^{}@]+(?=\{)/g).flatMap((s) => s.split(","))) assert.ok(/\.kc-/.test(selector.trim()) || /^keyframes kc-/.test(selector.trim()) || /^(from|to)$/.test(selector.trim()), `a style that could touch the host site: ${selector}`);
  assert.deepEqual(Object.keys(v.window).filter((k) => /kc|kasto|badge/i.test(k)), [], "no globals");
});

test("the script never builds the page from server text, and never uses anything risky", () => {
  const code = WIDGET.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\beval\(|new Function|document\.write|insertAdjacentHTML|outerHTML|localStorage|sessionStorage|document\.cookie/.test(code));
  const inner = code.match(/innerHTML\s*=[\s\S]*?;\n/g) || [];
  assert.equal(inner.length, 2);
  for (const statement of inner) assert.ok(!/\bname\b|\bthread\b|\bdata\b|business|shareUrl|askUrl/.test(statement.replace(/class="[^"]*"/g, "")), `server text goes into innerHTML: ${statement.slice(0, 80)}`);
  assert.match(code, /\.textContent = name/);
  assert.match(code, /shareLink\.href = shareUrl/);
  assert.match(code, /\^\\\/discussions\\\/\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$/);
});

test("the look is exactly what the old badge had", () => {
  const css = WIDGET.slice(WIDGET.indexOf("var style = document.createElement"), WIDGET.indexOf("document.head.appendChild(style)"));
  for (const piece of [".kc-badge-btn{position:fixed;bottom:20px;right:20px;", "background:#C8102E", ".kc-badge-card{background:#F5F0E8;border-radius:16px;max-width:300px", "z-index:2147483000", "z-index:2147483001"]) assert.ok(css.includes(piece), piece);
});

// ---------- the admin ----------

test("the business page shows the snippet and the counts, after the QR codes", () => {
  const page = fs.readFileSync("app/admin/sync/[id]/page.js", "utf8");
  assert.match(page, /badgeSnippet\(process\.env\.NEXT_PUBLIC_SITE_URL, merchant\.slug\)/);
  assert.match(page, /active=\{merchant\.status === "active"\}/);
  assert.ok(page.indexOf("<QrCodesPanel") < page.indexOf("<BadgePanel"));
  assert.match(page, /badgeError = "Could not load the badge counts\."/);
  const panel = fs.readFileSync("app/admin/sync/[id]/BadgePanel.js", "utf8");
  assert.ok(!/lib\/sync\/(merchants|qr|badge|threads)|supabase/.test(panel), "the browser panel imports something server-only");
});
