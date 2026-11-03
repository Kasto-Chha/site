// The business types: a long, grouped list, each filed under a KastoChha category by
// default, with the category changeable by hand only on purpose, and only to one of
// KastoChha's own.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { BUSINESS_TYPES, BUSINESS_GROUPS, categoryForKind, labelForKind, isBusinessKind, DEFAULT_BUSINESS_KIND } = await import("../lib/sync/businessTypes.js");
const { validateCreate, validateUpdate } = await import("../lib/sync/validate.js");
const { CATEGORIES } = await import("../lib/categories.js");

const LABELS = CATEGORIES.map((c) => c.label);
const BASE = { businessName: "Momo Hub", area: "Pulchowk", threadMode: "new" };

test("there is a real range of business types, in groups", () => {
  assert.equal(BUSINESS_TYPES.length, 23);
  assert.equal(BUSINESS_GROUPS.length, 7);
  for (const group of BUSINESS_GROUPS) assert.ok(group.types.length >= 1, `${group.category} has no types`);
  assert.deepEqual(BUSINESS_GROUPS.map((g) => g.category), ["Food", "Health & Lifestyle", "Travel", "Tech & Gadgets", "Motors", "Career", "Other"]);
});

test("every type is well formed, and none is listed twice", () => {
  const keys = BUSINESS_TYPES.map((t) => t.key);
  const labels = BUSINESS_TYPES.map((t) => t.label.toLowerCase());
  assert.equal(new Set(keys).size, keys.length, "a key is used twice");
  assert.equal(new Set(labels).size, labels.length, "a label is used twice");
  for (const type of BUSINESS_TYPES) {
    assert.match(type.key, /^[a-z][a-z0-9_]*$/, type.key);
    assert.ok(type.label.length >= 3 && type.label.length <= 40, type.label);
  }
});

test("every group is filed under a real KastoChha category", () => {
  for (const group of BUSINESS_GROUPS) assert.ok(LABELS.includes(group.category), `${group.category} is not a category`);
  for (const type of BUSINESS_TYPES) assert.equal(categoryForKind(type.key), type.category);
});

test("the original four types still work, under the same keys", () => {
  for (const key of ["cafe", "restaurant", "bakery", "bar"]) {
    assert.equal(isBusinessKind(key), true, key);
    assert.equal(categoryForKind(key), "Food", key);
  }
  assert.equal(DEFAULT_BUSINESS_KIND, "cafe");
});

test("there is a way to list a business that fits nowhere else", () => {
  assert.equal(isBusinessKind("other_business"), true);
  assert.equal(categoryForKind("other_business"), "Other");
  assert.equal(labelForKind("other_business"), "Other business");
  assert.equal(labelForKind("nope"), "");
  assert.equal(categoryForKind("nope"), "");
  assert.equal(isBusinessKind("nope"), false);
});

test("a new type needs no migration: the database does not restrict the business type", () => {
  for (const file of fs.readdirSync("supabase/migrations")) {
    const sql = fs.readFileSync(`supabase/migrations/${file}`, "utf8").replace(/--.*$/gm, "");
    // A check on the type would look like check (business_kind in (...)), or sit on the column's own line.
    assert.ok(!/\bcheck\s*\([^)]*business_kind/i.test(sql), `${file} has a check that involves business_kind`);
    assert.ok(!/business_kind[^,;\n]*\bcheck\b/i.test(sql), `${file} puts a check on the business_kind column`);
  }
});

// ---------- the category follows the type, unless changed by hand ----------

test("each type gives its own category by default, for a new business", () => {
  for (const type of BUSINESS_TYPES) {
    const { values, error } = validateCreate({ ...BASE, businessKind: type.key });
    assert.equal(error, undefined, type.key);
    assert.equal(values.business_kind, type.key);
    assert.equal(values.category, type.category, `${type.key} should be filed under ${type.category}`);
  }
  assert.equal(validateCreate(BASE).values.category, "Food", "no type chosen means a cafe, which is Food");
});

test("a salon is Health & Lifestyle and a mobile shop is Tech & Gadgets, as an example", () => {
  assert.equal(validateCreate({ ...BASE, businessKind: "salon" }).values.category, "Health & Lifestyle");
  assert.equal(validateCreate({ ...BASE, businessKind: "mobile_shop" }).values.category, "Tech & Gadgets");
  assert.equal(validateCreate({ ...BASE, businessKind: "hotel" }).values.category, "Travel");
});

test("a category chosen by hand wins, but only if it is one of KastoChha's", () => {
  const chosen = validateCreate({ ...BASE, businessKind: "gym", categoryOverride: "Career" });
  assert.equal(chosen.error, undefined);
  assert.equal(chosen.values.category, "Career");
  assert.equal(chosen.values.business_kind, "gym");
  for (const bad of ["Politics", "food", "FOOD ", "Shopping", "<b>x</b>"]) {
    const result = validateCreate({ ...BASE, categoryOverride: bad });
    if (bad === "FOOD ") continue;
    assert.match(result.error || "", /categories/, bad);
  }
  assert.equal(validateCreate({ ...BASE, categoryOverride: "  Travel  " }).values.category, "Travel", "surrounding spaces are tolerated");
});

test("an empty override means the type's own category", () => {
  for (const empty of ["", "   ", null, undefined]) {
    assert.equal(validateCreate({ ...BASE, businessKind: "salon", categoryOverride: empty }).values.category, "Health & Lifestyle", String(empty));
  }
});

test("a plain 'category' from a browser is still never read", () => {
  for (const stale of ["Career", "Travel", "Politics", "", null, 42]) {
    const result = validateCreate({ ...BASE, businessKind: "restaurant", category: stale });
    assert.equal(result.error, undefined, String(stale));
    assert.equal(result.values.category, "Food", `a browser sent category=${stale}`);
  }
});

test("an edit: the type alone re-derives; an override alone sets; an empty override resets", () => {
  const current = { slug: "a", topic_slug: "b", status: "active", business_kind: "cafe", category: "Career" };
  assert.equal(validateUpdate({ businessKind: "gym" }, current).values.category, "Health & Lifestyle", "changing the type re-derives");
  assert.equal(validateUpdate({ businessKind: "gym", categoryOverride: "Travel" }, current).values.category, "Travel", "type and override together: the override wins");
  assert.equal(validateUpdate({ categoryOverride: "Motors" }, current).values.category, "Motors", "an override on its own sets the category");
  assert.equal(validateUpdate({ categoryOverride: "" }, current).values.category, "Food", "resetting uses the current type's category");
  assert.equal(validateUpdate({ categoryOverride: "" }, { ...current, business_kind: "salon" }).values.category, "Health & Lifestyle");
  assert.match(validateUpdate({ categoryOverride: "Politics" }, current).error, /categories/);
  assert.ok(!("category" in validateUpdate({ about: "Hello." }, current).values), "an edit that does not touch type or category leaves the category alone");
  assert.equal(validateUpdate({ businessKind: "casino" }, current).error.includes("business type"), true);
});

test("the category is checked on the server even when the form says it is fine", () => {
  const sources = ["app/api/admin/sync/merchants/route.js", "app/api/admin/sync/merchants/[id]/route.js"].map((f) => fs.readFileSync(f, "utf8"));
  for (const source of sources) {
    assert.match(source, /validateCreate|validateUpdate/);
    assert.ok(!/body\.category|parsed\.data\.category|\.category\s*=/.test(source), "a route reads a category straight from the request");
  }
  assert.match(fs.readFileSync("lib/sync/validate.js", "utf8"), /CATEGORY_LABELS\.includes\(override\)/);
});
