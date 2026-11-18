// Patch 14l: the menu, rooms and rates, or services.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const M = await import("../lib/sync/menu.js");
const { familyInfo } = await import("../lib/sync/families.js");
const { POST: postRoute, PATCH: patchRoute, PUT: putRoute, DELETE: deleteRoute } = await import("../app/api/admin/sync/merchants/[id]/menu/route.js");
const read = (file) => fs.readFileSync(file, "utf8");

// ---------- the rules ----------

test("an item needs a name; the section, price, unit, description and status are checked", () => {
  assert.ok(M.cleanItem({}).error);
  assert.ok(M.cleanItem({ name: "  " }).error);
  assert.ok(M.cleanItem({ name: "x".repeat(101) }).error);
  assert.ok(M.cleanItem({ name: "a", section: "x".repeat(61) }).error);
  assert.ok(M.cleanItem({ name: "a", unit: "x".repeat(41) }).error);
  assert.ok(M.cleanItem({ name: "a", description: "x".repeat(301) }).error);
  assert.ok(M.cleanItem({ name: "a", status: "done" }).error);
  for (const price of ["-5", "3.5", "abc", "1e3", "1000000000", "Rs 5"]) assert.ok(M.cleanItem({ name: "a", price }).error, price);
  assert.ok(M.cleanItem(null).error && M.cleanItem([1]).error);
  assert.deepEqual(M.cleanItem({ name: "  Masala   chiya ", section: " Tea ", price: "1,250", unit: "per cup", description: "Spiced" }).values, { name: "Masala chiya", section: "Tea", price: 1250, unit: "per cup", description: "Spiced" });
  assert.equal(M.cleanItem({ name: "a", price: "" }).values.price, null);
  assert.equal(M.cleanItem({ name: "a", price: 0 }).values.price, 0, "free is a price");
});

test("an edit changes only what it names, and an empty edit is refused", () => {
  assert.deepEqual(M.cleanItem({ status: "waiting" }, { partial: true }).values, { status: "waiting" });
  assert.ok(M.cleanItem({}, { partial: true }).error);
  assert.ok(M.cleanItem({ name: "" }, { partial: true }).error);
});

test("changing what an item says is a content change; an unchanged value or a status move is not", () => {
  const existing = { name: "Chiya", section: "Tea", description: "", price: 50, unit: "", status: "confirmed" };
  assert.equal(M.changesContent({ price: 60 }, existing), true);
  assert.equal(M.changesContent({ name: "Milk tea" }, existing), true);
  assert.equal(M.changesContent({ price: 50, name: "Chiya" }, existing), false);
  assert.equal(M.changesContent({ status: "draft" }, existing), false);
  assert.equal(M.changesContent({ price: null }, existing), true);
});

test("prices read as rupees with the unit", () => {
  assert.equal(M.formatPrice(1250, "per night"), "Rs 1,250 per night");
  assert.equal(M.formatPrice(0, ""), "Rs 0");
  assert.equal(M.formatPrice(null, "per night"), "");
});

test("the list is grouped by section in first-seen order and copies out as plain text", () => {
  const items = [
    { id: "1", section: "Tea", name: "Chiya", price: 50, unit: "per cup", status: "confirmed", position: 1, description: "" },
    { id: "2", section: "Momo", name: "Buff momo", price: 220, unit: "", status: "draft", position: 2, description: "Steamed" },
    { id: "3", section: "Tea", name: "Masala tea", price: null, unit: "", status: "confirmed", position: 3, description: "" },
    { id: "4", section: "", name: "Water", price: 30, unit: "", status: "confirmed", position: 4, description: "" }
  ];
  assert.deepEqual(M.groupItems(items).map((g) => [g.section, g.items.map((i) => i.id)]), [["Tea", ["1", "3"]], ["Momo", ["2"]], ["", ["4"]]]);
  assert.equal(M.formatList(items), "TEA\nChiya - Rs 50 per cup\nMasala tea\n\nWater - Rs 30");
  assert.match(M.formatList(items, { onlyConfirmed: false }), /MOMO\nBuff momo - Rs 220\n {2}Steamed/);
  assert.equal(M.formatList([{ ...items[1] }]), "", "a draft alone is not copied as confirmed");
});

test("a neighbour is the next item in the same section, and none at the ends", () => {
  const items = [{ id: "a", section: "Tea", position: 1 }, { id: "b", section: "Momo", position: 2 }, { id: "c", section: "Tea", position: 3 }];
  assert.equal(M.neighbour(items, "a", "down").id, "c");
  assert.equal(M.neighbour(items, "c", "up").id, "a");
  assert.equal(M.neighbour(items, "a", "up"), null);
  assert.equal(M.neighbour(items, "c", "down"), null);
  assert.equal(M.neighbour(items, "zz", "up"), null);
});

test("each kind of business gets its own words", () => {
  assert.equal(familyInfo("cafe").itemsWord, "Menu");
  assert.equal(familyInfo("hotel").itemsWord, "Rooms and rates");
  assert.equal(familyInfo("hotel").itemWord, "Room type");
  assert.equal(familyInfo("homestay").addWord, "Add a room type");
  assert.equal(familyInfo("salon").itemsWord, "Services");
  for (const kind of ["cafe", "hotel", "salon"]) for (const key of ["itemWord", "sectionHint", "unitHint", "addWord"]) assert.ok(familyInfo(kind)[key], `${kind} ${key}`);
});

// ---------- the routes ----------

const fake = new FakePostgrest();
const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]; const saved = {};
before(async () => { await fake.listen(); for (const k of ENV) saved[k] = process.env[k]; process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
after(async () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } await fake.close(); });
const as = (userId, role) => { globalThis.__KC_TEST__ = { userId, roles: userId ? { [userId]: role } : {}, cookies: {}, revalidatedPaths: [] }; };
const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const seed = (id = ID, extra = {}) => fake.tables.sync_merchants.push({ id, slug: `b-${id.slice(0, 4)}`, topic_slug: `t-${id.slice(0, 4)}`, business_name: "Himal Brew House", area: "Jhamsikhel", status: "active", ...extra });
beforeEach(() => { fake.reset(); as("user_admin", "admin"); seed(); });
const send = async (route, method, b, id = ID, query = "") => { const r = await route(new Request(`https://www.kastochhanepal.com/x${query}`, { method, headers: { "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) }), { params: { id } }); return { status: r.status, body: await r.json() }; };
const create = (b = { name: "Masala chiya", section: "Tea", price: "60", unit: "per cup" }, id) => send(postRoute, "POST", b, id);
const patch = (b, id) => send(patchRoute, "PATCH", b, id);
const bulk = (action, id) => send(putRoute, "PUT", { action }, id);
const del = (item, id) => send(deleteRoute, "DELETE", undefined, id, `?item=${item}`);
const rows = () => fake.tables.sync_menu_items;

test("an admin adds an item; it starts as a draft at the end, whatever status was sent", async () => {
  const a = await create();
  assert.equal(a.status, 200);
  const b = await create({ name: "Buff momo", price: "220", status: "confirmed" });
  assert.equal(b.status, 200);
  assert.equal(rows().length, 2);
  assert.ok(rows().every((r) => r.status === "draft"));
  assert.equal(rows()[0].created_by, "user_admin");
  assert.ok(rows()[1].position > rows()[0].position);
  assert.equal(rows()[0].price, 60);
});

test("an item goes draft, waiting, confirmed; changing what it says takes the confirmation back", async () => {
  const { body } = await create();
  assert.equal((await patch({ itemId: body.id, status: "waiting" })).status, 200);
  assert.equal((await patch({ itemId: body.id, status: "confirmed" })).status, 200);
  assert.equal(rows()[0].status, "confirmed");
  const edit = await patch({ itemId: body.id, price: "80" });
  assert.equal(edit.body.status, "draft");
  assert.equal(rows()[0].status, "draft");
  assert.equal(rows()[0].price, 80);
  await patch({ itemId: body.id, status: "confirmed" });
  await patch({ itemId: body.id, price: "80", name: "Masala chiya" });
  assert.equal(rows()[0].status, "confirmed", "the same words keep the confirmation");
  await patch({ itemId: body.id, name: "Masala tea", status: "confirmed" });
  assert.equal(rows()[0].status, "confirmed", "an explicit status wins");
});

test("send and confirm move the whole list, and only the right step", async () => {
  await create(); await create({ name: "Two" }); const three = (await create({ name: "Three" })).body;
  await patch({ itemId: three.id, status: "confirmed" });
  assert.deepEqual((await bulk("send")).body, { ok: true, changed: 2 });
  assert.deepEqual(rows().map((r) => r.status), ["waiting", "waiting", "confirmed"]);
  assert.deepEqual((await bulk("confirm")).body, { ok: true, changed: 2 });
  assert.ok(rows().every((r) => r.status === "confirmed"));
  assert.deepEqual((await bulk("confirm")).body, { ok: true, changed: 0 });
  for (const bad of ["publish", "", undefined, "__proto__"]) assert.equal((await bulk(bad)).status, 400, String(bad));
});

test("bulk and edits touch only this business", async () => {
  seed(OTHER);
  await create(undefined, OTHER);
  const mine = (await create()).body;
  await bulk("send");
  assert.deepEqual(rows().map((r) => [r.merchant_id, r.status]), [[OTHER, "draft"], [ID, "waiting"]]);
  assert.equal((await patch({ itemId: rows()[0].id, status: "confirmed" })).status, 404);
  assert.equal((await del(rows()[0].id)).status, 404);
  assert.equal(rows().length, 2);
  assert.ok(mine.id);
});

test("items move up and down inside a section, and an end item stays put", async () => {
  const a = (await create({ name: "A", section: "Tea" })).body;
  await create({ name: "M", section: "Momo" });
  const c = (await create({ name: "C", section: "Tea" })).body;
  const order = async () => (await M.listItems((await import("../lib/supabase/server.js")).createServerSupabase(), ID)).map((r) => r.name).join("");
  assert.equal(await order(), "AMC");
  assert.deepEqual((await patch({ itemId: c.id, move: "up" })).body, { ok: true, moved: true });
  assert.equal(await order(), "CMA");
  assert.deepEqual((await patch({ itemId: c.id, move: "up" })).body, { ok: true, moved: false });
  await patch({ itemId: a.id, move: "up" });
  assert.equal(await order(), "AMC", "the last one of the section moves up past its neighbour, never past another section's item");
  assert.equal((await patch({ itemId: a.id, move: "sideways" })).status, 400);
});

test("a list has a limit", async () => {
  for (let i = 0; i < M.ITEM_LIMIT; i += 1) fake.tables.sync_menu_items.push({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, merchant_id: ID, section: "", name: `n${i}`, description: "", price: null, unit: "", status: "draft", position: i, created_at: "2026-01-01T00:00:00Z" });
  const r = await create();
  assert.equal(r.status, 400);
  assert.match(r.body.error, /at most 300/);
  assert.equal(rows().length, M.ITEM_LIMIT);
});

test("the audit log keeps ids, status and counts, never a name, a price or a description", async () => {
  const { body } = await create({ name: "Secret dish name", price: "98765", description: "Hidden description", section: "Hidden section" });
  await patch({ itemId: body.id, name: "Renamed secret", price: "77777", status: "waiting" });
  await patch({ itemId: body.id, move: "down" });
  await bulk("confirm");
  await del(body.id);
  const log = JSON.stringify(fake.tables.admin_audit_log);
  for (const action of ["sync.menu.create", "sync.menu.update", "sync.menu.bulk", "sync.menu.delete"]) assert.ok(log.includes(action), action);
  for (const secret of ["Secret dish", "98765", "Hidden", "Renamed", "77777"]) assert.ok(!log.includes(secret), secret);
});

test("a bad request changes nothing and writes no log entry", async () => {
  for (const bad of [{ name: "" }, { name: "a", price: "-1" }, { name: "a", unit: "x".repeat(41) }]) assert.equal((await create(bad)).status, 400, JSON.stringify(bad));
  assert.equal((await patch({ itemId: "nope", status: "waiting" })).status, 400);
  assert.equal((await del("nope")).status, 400);
  assert.equal(rows().length, 0);
  assert.equal(fake.tables.admin_audit_log.length, 0);
  assert.equal((await create(undefined, "not-a-uuid")).status, 400);
  assert.equal((await create(undefined, OTHER)).status, 404);
});

test("if the audit log cannot be written, nothing is saved, changed, moved or removed", async () => {
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await create()).status, 500);
  fake.failWritesTo = null;
  assert.equal(rows().length, 0);
  const { body } = await create();
  fake.failWritesTo = "admin_audit_log";
  assert.equal((await patch({ itemId: body.id, status: "waiting" })).status, 500);
  assert.equal((await bulk("send")).status, 500);
  assert.equal((await del(body.id)).status, 500);
  fake.failWritesTo = null;
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].status, "draft");
});

test("signed out and ordinary users are refused", async () => {
  const { body } = await create();
  for (const [who, role, status] of [[null, null, 401], ["user_c", "user", 403]]) {
    as(who, role);
    assert.equal((await create()).status, status);
    assert.equal((await patch({ itemId: body.id, status: "waiting" })).status, status);
    assert.equal((await bulk("send")).status, status);
    assert.equal((await del(body.id)).status, status);
  }
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].status, "draft");
});

test("an operator works only on an assigned business; an unassigned one looks like it does not exist", async () => {
  const { body } = await create();
  as("user_op", "operator");
  assert.equal((await create()).status, 404);
  assert.equal((await patch({ itemId: body.id, status: "waiting" })).status, 404);
  assert.equal((await bulk("send")).status, 404);
  assert.equal((await del(body.id)).status, 404);
  fake.tables.sync_operator_assignments.push({ operator_user_id: "user_op", merchant_id: ID });
  assert.equal((await create()).status, 200);
  assert.equal((await patch({ itemId: body.id, status: "waiting" })).status, 200);
  assert.equal((await bulk("send")).status, 200);
  assert.equal((await del(body.id)).status, 200);
});

test("a Free business cannot get new items or changes, but its items can be removed; an unreadable stage never blocks", async () => {
  const { body } = await create();
  Object.assign(fake.tables.sync_merchants[0], { stage: "free", trial_started_on: "2026-01-01", trial_ends_on: "2026-04-01" });
  const r = await create();
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Free plan/);
  assert.equal((await patch({ itemId: body.id, status: "waiting" })).status, 409);
  assert.equal((await bulk("send")).status, 409);
  assert.equal(rows().length, 1);
  assert.equal((await del(body.id)).status, 200);
  assert.equal(rows().length, 0);
  fake.reset(); as("user_admin", "admin"); seed();
  assert.equal((await create()).status, 200, "no stage row: not blocked");
});

// ---------- the screen and the files ----------

test("the Google tab names the panel by the business type and opens the full view; the panel holds Free, asks twice and uses no dialogs", () => {
  const page = read("app/admin/sync/[id]/page.js");
  assert.match(page, /view=menu/);
  assert.match(page, /words\.itemsWord/);
  assert.match(page, /Has migration 0034 been run\?/);
  const client = read("app/admin/sync/[id]/MenuPanel.js");
  for (const text of ["Really remove", "Send for the owner", "Owner confirmed", "Copy confirmed items", "Back to draft", "disabled={off"]) assert.ok(client.includes(text), text);
  assert.ok(!/window\.(confirm|alert|prompt)/.test(client));
  assert.ok(!/dangerouslySetInnerHTML/.test(client));
  assert.ok(!/<nav[\s>]/.test(client));
});

test("the migration adds one private table tied to its business and is safe to replay", () => {
  const sql = read("supabase/migrations/0034_sync_menu_items.sql").replace(/--.*$/gm, "");
  assert.match(sql, /create table if not exists public\.sync_menu_items/i);
  assert.match(sql, /references public\.sync_merchants\(id\) on delete cascade/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.sync_menu_items from anon, authenticated/i);
  assert.ok(!/drop\s|delete\s+from|truncate/i.test(sql));
  const book = read("docs/sync/runbook.md");
  assert.match(book, /0034_sync_menu_items\.sql/);
  assert.match(book, /### Menu, rooms and rates, services/);
});
