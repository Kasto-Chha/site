// The Battle card's look: the pictures must actually be visible. The first version
// laid a 64% dark tint over everything, which buried them. These guard the light
// wash, the fade that keeps the text readable, and the label behind the call to
// action, so nothing quietly darkens the card again.

import test from "node:test";
import assert from "node:assert/strict";

const { buildBattleCard, BATTLE_TINT, BATTLE_SCRIM } = await import("../lib/ogCards.js");

const sides = { left: { name: "Lumbini Lions", image: null, color: "#c8102e" }, right: { name: "Sudurpaschim Royals", image: null, color: "#1f5fae" } };
const card = () => buildBattleCard({ ...sides, votes: { left: 1, right: 3 }, stat: "4 votes", logo: null });

function nodes(node, out = []) {
  if (!node || typeof node !== "object") return out;
  out.push(node);
  const kids = node.props?.children;
  for (const kid of Array.isArray(kids) ? kids : [kids]) nodes(kid, out);
  return out;
}
const alphas = (gradient) => [...gradient.matchAll(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/g)].map((m) => Number(m[1]));
const styleOf = (n) => n.props?.style || {};

test("the red and blue wash is light enough to show the pictures", () => {
  const tint = alphas(BATTLE_TINT);
  assert.equal(tint.length, 3);
  for (const a of tint) assert.ok(a >= 0.1 && a <= 0.25, `a tint of ${a} would bury or lose the sides`);
});

test("a dark fade toward the bottom keeps the bar, names and votes readable", () => {
  const [top, bottom] = alphas(BATTLE_SCRIM);
  assert.equal(top, 0, "the top of the card must stay clear");
  assert.ok(bottom >= 0.4 && bottom <= 0.6, `the bottom fade is ${bottom}`);
  assert.match(BATTLE_SCRIM, /^linear-gradient\(180deg/);
});

test("the card uses both layers, above the pictures and below the text", () => {
  const root = card();
  const layers = root.props.children;
  const at = (gradient) => layers.findIndex((n) => styleOf(n).backgroundImage === gradient);
  const tint = at(BATTLE_TINT), scrim = at(BATTLE_SCRIM);
  assert.ok(tint > 1 && scrim > tint, `layer order is wrong: tint ${tint}, fade ${scrim}`);
  const content = layers.findIndex((n) => styleOf(n).flexDirection === "column" && styleOf(n).justifyContent === "space-between");
  assert.ok(content > scrim, "the text must sit above both layers");
  // the pictures (or their colour panels) are the first two layers
  assert.ok(layers.slice(0, 2).every((n) => n.type === "img" || styleOf(n).backgroundImage?.includes("150deg")));
});

test("the call to action has a dark label behind it, so a white logo can't swallow it", () => {
  const kicker = nodes(card()).find((n) => JSON.stringify(n.props?.children) === JSON.stringify(["Pick your side. Cast your vote."]));
  assert.ok(kicker, "the call to action text is missing");
  const style = styleOf(kicker);
  assert.equal(style.borderRadius, "999px");
  assert.equal(style.alignSelf, "flex-start");
  assert.deepEqual(alphas(style.background).map((a) => a >= 0.5 && a <= 0.75), [true]);
  assert.equal(style.color, "#fff");
});

test("nothing darker than the light wash is laid over the whole card", () => {
  const full = nodes(card()).filter((n) => styleOf(n).width === "1200px" && styleOf(n).height === "630px" && styleOf(n).backgroundImage);
  for (const layer of full) {
    const gradient = styleOf(layer).backgroundImage;
    if (gradient.includes("150deg")) continue; // a side's own colour panel, not an overlay
    assert.ok([BATTLE_TINT, BATTLE_SCRIM].includes(gradient), `an unexpected full-card layer: ${gradient}`);
  }
});

test("the BATTLE chip is dark, so it can't vanish on a pale picture", () => {
  const chip = nodes(card()).find((n) => JSON.stringify(n.props?.children || "").includes('"Battle"') && styleOf(n).borderRadius === "999px");
  assert.ok(chip, "the chip is missing");
  const [alpha] = alphas(styleOf(chip).background);
  assert.ok(alpha >= 0.5 && alpha <= 0.75, `the chip's backing is ${alpha}`);
  assert.match(styleOf(chip).background, /rgba\(10,\s*8,\s*7,/);
});
