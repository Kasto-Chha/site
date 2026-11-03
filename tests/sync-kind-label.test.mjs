// "Other (write it in)": a business that fits none of the types says what it is, in the
// admin's own words, and customers see those words. Nothing else is asked of them.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { OTHER_KIND, KIND_LABEL_MAX, BUSINESS_GROUPS, kindDisplay, labelForKind, categoryForKind } = await import("../lib/sync/businessTypes.js");
const { validateCreate, validateUpdate } = await import("../lib/sync/validate.js");
const { publicMerchant, getMerchantBySlug } = await import("../lib/sync/merchants.js");
const { POST: createRoute } = await import("../app/api/admin/sync/merchants/route.js");
const { PUT: updateRoute } = await import("../app/api/admin/sync/merchants/[id]/route.js");

const BASE = { businessName: "Ram Workshop", area: "Baneshwor", threadMode: "new" };
const OTHER = { ...BASE, businessKind: OTHER_KIND };

// ---------- the migration ----------

const SQL = fs.readFileSync("supabase/migrations/0020_sync_kind_label.sql", "utf8").replace(/--.*$/gm, "");

test("the migration adds one optional, length-checked column, and can be run again", () => {
  assert.match(SQL, /alter table public\.sync_merchants\s+add column if not exists kind_label text/);
  assert.match(SQL, /constraint sync_merchants_kind_label_length check \(kind_label is null or char_length\(kind_label\) between 1 and 60\)/);
  assert.ok(!/\bnot null\b/i.test(SQL), "an older business has no words, so the column must allow that");
  assert.ok(!/\bdrop\b|\bupdate\b|\bdelete\b/i.test(SQL));
  assert.equal(KIND_LABEL_MAX, 60, "the code and the database must agree on the limit");
  const files = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  assert.ok(files.indexOf("0020_sync_kind_label.sql") > files.indexOf("0019_sync_thread_summary.sql"));
});

// ---------- the dropdown ----------

test("the dropdown ends with one Other entry, called 'Other (write it in)'", () => {
  const last = BUSINESS_GROUPS[BUSINESS_GROUPS.length - 1];
  assert.equal(last.category, "Other");
  assert.deepEqual(last.types[last.types.length - 1], { key: OTHER_KIND, label: "Other (write it in)" });
  assert.equal(BUSINESS_GROUPS.flatMap((g) => g.types).filter((t) => t.key === OTHER_KIND).length, 1, "there is exactly one");
  assert.equal(categoryForKind(OTHER_KIND), "Other");
  assert.equal(labelForKind(OTHER_KIND), "Other (write it in)");
});

// ---------- what customers see ----------

test("customers see the words for an Other business, and the type's name otherwise", () => {
  assert.equal(kindDisplay(OTHER_KIND, "Motorcycle workshop"), "Motorcycle workshop");
  assert.equal(kindDisplay(OTHER_KIND, "  Motorcycle workshop  "), "Motorcycle workshop");
  assert.equal(kindDisplay("salon", "ignored words"), "Salon", "a standard type never shows typed words");
  assert.equal(kindDisplay("garage", null), "Garage");
});

test("an Other business with no words is never shown as the admin's menu text", () => {
  for (const missing of [null, undefined, "", "   "]) assert.equal(kindDisplay(OTHER_KIND, missing), "Business");
  assert.equal(kindDisplay("nope", null), "Business");
  assert.equal(kindDisplay(undefined, undefined), "Business");
});

test("what goes to a browser carries the words, not the menu text", () => {
  const base = { slug: "s", topic_slug: "t", business_name: "N", area: "A", business_kind: OTHER_KIND, category: "Motors", kind_label: "Motorcycle workshop", owner_user_id: "user_x" };
  assert.equal(publicMerchant(base).kindName, "Motorcycle workshop");
  assert.equal(publicMerchant({ ...base, kind_label: null }).kindName, "Business");
  assert.equal(publicMerchant({ ...base, business_kind: "salon", kind_label: null }).kindName, "Salon");
  assert.ok(!JSON.stringify(publicMerchant(base)).includes("user_x"));
});

// ---------- the rules: write it in, and nothing else ----------

test("an Other business must say what it is", () => {
  for (const missing of [undefined, null, "", "   ", "\n\t", "x"]) {
    assert.match(validateCreate({ ...OTHER, kindLabel: missing }).error || "", /Write what this business is/, JSON.stringify(missing));
  }
  const ok = validateCreate({ ...OTHER, kindLabel: "Motorcycle workshop" });
  assert.equal(ok.error, undefined);
  assert.equal(ok.values.kind_label, "Motorcycle workshop");
  assert.equal(ok.values.business_kind, OTHER_KIND);
  assert.equal(ok.values.category, "Other", "the category defaults to Other, and can still be changed by hand");
});

test("the words are tidied and limited to sixty characters, with nothing else asked of them", () => {
  assert.equal(validateCreate({ ...OTHER, kindLabel: "  Motorcycle \t  workshop \n" }).values.kind_label, "Motorcycle workshop");
  assert.equal(validateCreate({ ...OTHER, kindLabel: "Mo" }).values.kind_label, "Mo", "two characters is enough");
  assert.equal(validateCreate({ ...OTHER, kindLabel: "x".repeat(60) }).error, undefined);
  assert.match(validateCreate({ ...OTHER, kindLabel: "x".repeat(61) }).error, /at most 60/);
  // No other rule: plain words, other languages, numbers and punctuation are all accepted.
  for (const free of ["Bike & scooter repair", "2-wheeler servicing (24/7)", "Best bike shop", "Sweets, snacks and tea", "\u092e\u094b\u091f\u0930\u0938\u093e\u0907\u0915\u0932 \u092e\u0930\u094d\u092e\u0924"]) {
    const result = validateCreate({ ...OTHER, kindLabel: free });
    assert.equal(result.error, undefined, free);
    assert.equal(result.values.kind_label, free);
  }
});

test("a standard type has no words, even if some are sent", () => {
  for (const kind of ["cafe", "salon", "garage"]) {
    const result = validateCreate({ ...BASE, businessKind: kind, kindLabel: "Should be dropped" });
    assert.equal(result.error, undefined, kind);
    assert.equal(result.values.kind_label, null, kind);
  }
  assert.equal(validateCreate(BASE).values.kind_label, null, "no type chosen means a cafe, which has none");
});

test("the Other category can still be changed by hand, as before", () => {
  const result = validateCreate({ ...OTHER, kindLabel: "Motorcycle workshop", categoryOverride: "Motors" });
  assert.equal(result.values.category, "Motors");
  assert.equal(result.values.kind_label, "Motorcycle workshop");
});

test("an edit: switching to Other needs words, switching away clears them, words alone update", () => {
  const cafe = { slug: "a", topic_slug: "b", status: "active", business_kind: "cafe", kind_label: null };
  const other = { ...cafe, business_kind: OTHER_KIND, kind_label: "Motorcycle workshop" };
  assert.match(validateUpdate({ businessKind: OTHER_KIND }, cafe).error, /Write what this business is/);
  assert.equal(validateUpdate({ businessKind: OTHER_KIND, kindLabel: "Spare parts" }, cafe).values.kind_label, "Spare parts");
  assert.equal(validateUpdate({ businessKind: "salon", kindLabel: "left over" }, other).values.kind_label, null, "switching away clears the words");
  assert.equal(validateUpdate({ kindLabel: "Bike repair" }, other).values.kind_label, "Bike repair", "words alone, for a business that is already Other");
  assert.match(validateUpdate({ kindLabel: "x" }, other).error, /Write what this business is/);
  assert.match(validateUpdate({ kindLabel: "x".repeat(61) }, other).error, /at most 60/);
  assert.match(validateUpdate({ kindLabel: "Bike repair" }, cafe).error, /nothing to change/, "words mean nothing for a standard type");
  assert.ok(!("kind_label" in validateUpdate({ about: "Hello." }, other).values), "an edit that does not touch the type leaves the words alone");
});

test("saving the type as Other again keeps the words already there", () => {
  const other = { slug: "a", topic_slug: "b", status: "active", business_kind: OTHER_KIND, kind_label: "Motorcycle workshop" };
  const result = validateUpdate({ businessKind: OTHER_KIND, about: "x" }, other);
  assert.equal(result.error, undefined);
  assert.equal(result.values.kind_label, "Motorcycle workshop");
});

// ---------- through the real routes ----------

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
  globalThis.__KC_TEST__ = { userId: "user_a", roles: { user_a: "admin" }, revalidatedPaths: [], cookies: {} };
});

const json = (url, method, body) => new Request(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const create = (body) => createRoute(json("/api/admin/sync/merchants", "POST", body));
const edit = (id, body) => updateRoute(json(`/api/admin/sync/merchants/${id}`, "PUT", body), { params: { id } });

test("an Other business is stored with its words, and a customer-facing read shows them", async () => {
  const res = await create({ ...OTHER, kindLabel: "  Motorcycle workshop " });
  assert.equal(res.status, 201);
  const { merchant } = await res.json();
  assert.equal(merchant.business_kind, OTHER_KIND);
  assert.equal(merchant.kind_label, "Motorcycle workshop");
  assert.equal(merchant.category, "Other");
  assert.equal(fake.tables.sync_merchants[0].kind_label, "Motorcycle workshop");
  assert.equal(fake.tables.admin_audit_log[0].after.kind_label, "Motorcycle workshop", "the audit trail records the words");
  const read = await getMerchantBySlug(merchant.slug);
  assert.equal(publicMerchant(read).kindName, "Motorcycle workshop");
});

test("Other without words is refused, and nothing is stored or audited", async () => {
  const res = await create({ ...OTHER, kindLabel: "" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Write what this business is/);
  assert.equal(fake.tables.sync_merchants.length, 0);
  assert.equal(fake.tables.admin_audit_log.length, 0);
});

test("a standard type is stored with no words, even if some are sent", async () => {
  const res = await create({ ...BASE, businessKind: "salon", kindLabel: "Should be dropped" });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).merchant.kind_label, null);
});

test("editing: words change, and switching to a standard type clears them", async () => {
  const { merchant } = await (await create({ ...OTHER, kindLabel: "Motorcycle workshop" })).json();
  let res = await edit(merchant.id, { kindLabel: "Two-wheeler repair" });
  assert.equal((await res.json()).merchant.kind_label, "Two-wheeler repair");
  res = await edit(merchant.id, { businessKind: "garage", kindLabel: "" });
  const after = (await res.json()).merchant;
  assert.equal(after.business_kind, "garage");
  assert.equal(after.kind_label, null);
  assert.equal(after.category, "Motors", "the category follows the new type");
  res = await edit(merchant.id, { businessKind: OTHER_KIND });
  assert.equal(res.status, 400);
});

// ---------- the screens ----------

const FORMS = ["app/admin/sync/new/NewMerchantClient.js", "app/admin/sync/[id]/MerchantEditorClient.js"];

test("the box shows only for Other, is cleared when the type changes, and is sent only for Other", () => {
  for (const file of FORMS) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /businessKind === OTHER_KIND \? \(\s*<KindLabelField/, `${file} does not show the box only for Other`);
    assert.match(source, /if \(e\.target\.value !== OTHER_KIND\) setKindLabel\(""\)/, `${file} keeps old words after the type changes`);
    assert.match(source, /kindLabel: businessKind === OTHER_KIND \? kindLabel : ""/, `${file} sends words for a standard type`);
    const controls = (source.match(/<(input|select|textarea)\b/g) || []).length;
    assert.equal((source.match(/autoComplete="off"/g) || []).length, controls, `${file}: a control can have an old value restored`);
  }
  const field = fs.readFileSync("app/admin/sync/CategoryControl.js", "utf8");
  assert.match(field, /What is this business\?/);
  assert.match(field, /maxLength=\{KIND_LABEL_MAX\}/);
  assert.match(field, /required/);
});

test("the editor page hands the words to the form, and the owner's account stays on the server", () => {
  const page = fs.readFileSync("app/admin/sync/[id]/page.js", "utf8");
  assert.match(page, /kind_label: merchant\.kind_label \|\| ""/);
  assert.ok(!/owner_user_id\s*:/.test(page));
  assert.match(fs.readFileSync("app/admin/sync/page.js", "utf8"), /kindDisplay\(m\.business_kind, m\.kind_label\)/);
});
