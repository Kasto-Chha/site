// Things that pass when the source is run but break once the site is built. Each rule below comes from a defect
// found on the production build during the Stage A test, so each is a check on the SOURCE that stands in for the
// built site, which these tests cannot run.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function jsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    else if (/\.(js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("no pattern is built from a text string that holds a backslash (found as check F6)", () => {
  // `new RegExp(` + a template or a string with `\\b` in it was turned into a pattern that never matches by the
  // production build, while the same code worked from source. A pattern written as /literal/ is not affected.
  const offenders = [];
  for (const file of [...jsFiles("lib"), ...jsFiles("app")]) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/\bRegExp\(\s*(`[^`]*`|"[^"\n]*"|'[^'\n]*')/g)) {
      if (match[1].includes("\\")) offenders.push(`${file}: ${match[1].slice(0, 60)}`);
    }
  }
  assert.deepEqual(offenders, [], "build the pattern as a /literal/ or look words up in a Set");
});

test("public routes that read the database never reuse an earlier answer (found as check K3)", () => {
  // The scan address kept sending a removed business's card to its hub, and a switched-off card kept working,
  // because Next reused the first database answer it had seen. `force-dynamic` alone did not prevent that.
  // The sitemap and the image routes are meant to be cached and are not listed.
  for (const route of ["app/q/[code]/route.js", "app/api/topics/search/route.js", "app/api/discussions/page/route.js", "app/api/badge/check/route.js"]) {
    const text = fs.readFileSync(route, "utf8");
    assert.match(text, /export const fetchCache = "force-no-store";/, route);
  }
});

test("a draft saved before sign-in is put back in the reply box when it arrives late (found as check E15)", async () => {
  const { draftToApply, boxAlreadyHoldsDraft } = await import("../lib/restoreDraft.js");
  assert.deepEqual(draftToApply("", { summary: "My words", verdict: "Ramro chha" }), { summary: "My words", verdict: "Ramro chha" });
  assert.deepEqual(draftToApply("   ", { summary: "My words" }), { summary: "My words", verdict: "" });
  assert.equal(draftToApply("I already started typing", { summary: "My words" }), null, "never overwrite words being typed");
  for (const empty of [null, undefined, {}, { summary: "" }, { summary: "  " }, { summary: 5 }]) assert.equal(draftToApply("", empty), null);
  assert.equal(boxAlreadyHoldsDraft("My words", { summary: "My words" }), true);
  assert.equal(boxAlreadyHoldsDraft("", { summary: "" }), false);
  assert.equal(boxAlreadyHoldsDraft("Other", { summary: "My words" }), false);
  // The card must use it: the helper does nothing unless the effect that calls it is in place.
  const card = fs.readFileSync("app/components/TopicThread.js", "utf8");
  assert.match(card, /draftToApply\(replyText, restoredReply\)/);
  assert.match(card, /\}, \[restoredReply\]\);/);
  assert.match(card, /We kept what you wrote\./);
});
