// The tag form's bookkeeping and shape: choosing a thread fills in a name and an area,
// removing the choice takes exactly that back, and the category is never asked for (it
// follows the business type), after a stale "Career" showed up on a new cafe.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { chooseThread, unlinkThread, splitTitle, NO_PREFILL } = await import("../lib/sync/formState.js");
const { countLabel } = await import("../lib/sync/text.js");
const { BUSINESS_TYPES, DEFAULT_BUSINESS_KIND, categoryForKind, isBusinessKind } = await import("../lib/sync/businessTypes.js");
const { validateCreate, validateUpdate } = await import("../lib/sync/validate.js");
const { CATEGORIES } = await import("../lib/categories.js");

const EMPTY = { businessName: "", area: "" };

test("counts read naturally: 1 experience, 2 experiences", () => {
  assert.equal(countLabel(0, "experience", "experiences"), "0 experiences");
  assert.equal(countLabel(1, "experience", "experiences"), "1 experience");
  assert.equal(countLabel(2, "experience", "experiences"), "2 experiences");
  assert.equal(countLabel(1, "question", "questions"), "1 question");
  assert.equal(countLabel("1", "question", "questions"), "1 question");
  assert.equal(countLabel(1234, "question", "questions"), "1234 questions");
  for (const junk of [undefined, null, NaN, "x"]) assert.equal(countLabel(junk, "question", "questions"), "0 questions");
});

test("a title is split into a name and an area at its last comma", () => {
  assert.deepEqual(splitTitle("Himal Brew House, Jhamsikhel"), { name: "Himal Brew House", area: "Jhamsikhel" });
  assert.deepEqual(splitTitle("Bar, Grill, Patan"), { name: "Bar, Grill", area: "Patan" });
  assert.deepEqual(splitTitle("Loksewa exam"), { name: "Loksewa exam", area: "" });
  assert.deepEqual(splitTitle("  spaced , out  "), { name: "spaced", area: "out" });
  assert.deepEqual(splitTitle(undefined), { name: "", area: "" });
});

test("choosing a thread fills in what is empty, and remembers exactly what it filled", () => {
  const { form, prefill } = chooseThread(EMPTY, { title: "Himal Brew House, Jhamsikhel" });
  assert.deepEqual(form, { businessName: "Himal Brew House", area: "Jhamsikhel" });
  assert.deepEqual(prefill, { name: "Himal Brew House", area: "Jhamsikhel" });
});

test("choosing a thread never overwrites what the admin has already typed", () => {
  const { form, prefill } = chooseThread({ businessName: "My Own Name", area: "Sanepa" }, { title: "Himal Brew House, Jhamsikhel" });
  assert.deepEqual(form, { businessName: "My Own Name", area: "Sanepa" });
  assert.deepEqual(prefill, { name: "", area: "" });
  assert.deepEqual(chooseThread(EMPTY, null).form, EMPTY);
});

test("removing the choice takes back what it filled in, and nothing else", () => {
  const chosen = chooseThread(EMPTY, { title: "Loksewa exam" });
  assert.equal(chosen.form.businessName, "Loksewa exam");
  const removed = unlinkThread(chosen.form, chosen.prefill);
  assert.deepEqual(removed.form, EMPTY);
  assert.deepEqual(removed.prefill, NO_PREFILL);
});

test("what the admin typed or changed since choosing is kept when the choice is removed", () => {
  const chosen = chooseThread(EMPTY, { title: "Himal Brew House, Jhamsikhel" });
  const edited = { businessName: "Himal Brew & Co", area: chosen.form.area };
  const removed = unlinkThread(edited, chosen.prefill);
  assert.equal(removed.form.businessName, "Himal Brew & Co", "a renamed name stays");
  assert.equal(removed.form.area, "", "an area still exactly as filled in is taken back");
});

test("removing with nothing chosen changes nothing, and doing it twice is harmless", () => {
  const typed = { businessName: "Kupondol Kettle", area: "Kupondol" };
  assert.deepEqual(unlinkThread(typed, NO_PREFILL).form, typed);
  assert.deepEqual(unlinkThread(typed, undefined).form, typed);
  const once = unlinkThread(typed, NO_PREFILL);
  assert.deepEqual(unlinkThread(once.form, once.prefill).form, typed);
});

test("choosing one thread, removing it, then choosing another does not mix the two", () => {
  const first = chooseThread(EMPTY, { title: "Loksewa exam" });
  const cleared = unlinkThread(first.form, first.prefill);
  const second = chooseThread(cleared.form, { title: "Himal Brew House, Jhamsikhel" });
  assert.deepEqual(second.form, { businessName: "Himal Brew House", area: "Jhamsikhel" });
});

// ---------- the category follows the business type ----------

test("every business type is filed under a real KastoChha category", () => {
  assert.ok(BUSINESS_TYPES.length >= 4);
  for (const type of BUSINESS_TYPES) {
    assert.ok(CATEGORIES.some((c) => c.label === type.category), `${type.key} is filed under ${type.category}, which is not a category`);
  }
  assert.equal(categoryForKind("cafe"), "Food");
  assert.equal(categoryForKind("restaurant"), "Food");
  assert.equal(categoryForKind("casino"), "");
  assert.equal(categoryForKind(undefined), "");
  assert.equal(isBusinessKind(DEFAULT_BUSINESS_KIND), true);
  assert.equal(isBusinessKind("casino"), false);
  assert.equal(new Set(BUSINESS_TYPES.map((t) => t.key)).size, BUSINESS_TYPES.length, "a business type is listed twice");
});

test("the server sets the category from the type, whatever the browser sends", () => {
  const base = { businessName: "Momo Hub", area: "Pulchowk", threadMode: "new" };
  assert.equal(validateCreate(base).values.category, "Food");
  assert.equal(validateCreate({ ...base, businessKind: "restaurant" }).values.category, "Food");
  for (const stale of ["Career", "Travel", "Politics", "", null, 42]) {
    const result = validateCreate({ ...base, category: stale });
    assert.equal(result.error, undefined, String(stale));
    assert.equal(result.values.category, "Food", `a browser sent ${stale}`);
  }
  assert.match(validateCreate({ ...base, businessKind: "casino" }).error, /business type/);
});

test("an edit re-derives the category when the type is sent, and otherwise leaves it", () => {
  const current = { slug: "a", topic_slug: "b", status: "active" };
  const retyped = validateUpdate({ businessKind: "bakery", category: "Career" }, current);
  assert.equal(retyped.values.business_kind, "bakery");
  assert.equal(retyped.values.category, "Food", "a stale Career is corrected the next time the type is saved");
  const aboutOnly = validateUpdate({ about: "Hello." , category: "Career" }, current);
  assert.ok(!("category" in aboutOnly.values), "a category alone is never written");
});

// ---------- guards on the screens ----------

const FORMS = ["app/admin/sync/new/NewMerchantClient.js", "app/admin/sync/[id]/MerchantEditorClient.js"];

test("browsers are told not to restore old values into either form", () => {
  for (const file of FORMS) {
    const source = fs.readFileSync(file, "utf8");
    const controls = (source.match(/<(input|select|textarea)\b/g) || []).length;
    const off = (source.match(/autoComplete="off"/g) || []).length;
    assert.ok(controls > 5, `${file}: found too few controls to be a form`);
    assert.equal(off, controls, `${file}: ${controls - off} control(s) can have an old value restored into them`);
  }
});

test("neither form has a category dropdown, and neither sends a category when saving", () => {
  for (const file of FORMS) {
    const source = fs.readFileSync(file, "utf8");
    assert.ok(!/id="category"/.test(source), `${file} still has a category control`);
    assert.match(source, /categoryForKind\(/, `${file} does not derive the category from the type`);
  }
  // What each form sends on save, read from the source: the business's details, no category.
  const tag = fs.readFileSync(FORMS[0], "utf8").match(/body: JSON\.stringify\(\{([\s\S]*?)\}\)/)[1];
  const edit = fs.readFileSync(FORMS[1], "utf8").match(/send\(\{([^}]*)\}, "Saved\."\)/)[1];
  for (const [name, sent] of [["tag form", tag], ["editor", edit]]) {
    assert.match(sent, /businessKind/, `${name} does not send the business type`);
    assert.ok(!/categor/i.test(sent), `${name} sends a category: ${sent.trim().slice(0, 80)}`);
  }
});

test("the screens say 'experience' and 'question' in the singular, with the tested helper", () => {
  for (const file of ["app/admin/sync/page.js", "app/admin/sync/new/ThreadChoice.js", FORMS[1]]) {
    const source = fs.readFileSync(file, "utf8");
    assert.ok(!/\}\s*experiences\b/.test(source), `${file} hard-codes the plural`);
    assert.ok(!/\}\s*questions\b/.test(source), `${file} hard-codes the plural`);
    assert.match(source, /countLabel\(/, file);
  }
});

test("step 1 offers search, filters, paging and an address paste, and can be undone", () => {
  const form = fs.readFileSync(FORMS[0], "utf8");
  for (const wanted of ["paste a discussion address", "All categories", "Include threads that are already business threads", "unlinkThread(", "onRemove", "onChange", "Start a new thread from name and area"]) {
    assert.ok(form.includes(wanted), `the form lost: ${wanted}`);
  }
  const choice = fs.readFileSync("app/admin/sync/new/ThreadChoice.js", "utf8");
  for (const wanted of ["Show more", "Showing {threads.length} of {total}", "Switch to an existing thread", "Remove", "Change", "filed under"]) {
    assert.ok(choice.includes(wanted), `the thread pieces lost: ${wanted}`);
  }
  assert.ok(!/limit=|\.limit\(/.test(form), "the form decides its own page size");
});
