// Share cards are cached by address and drawn from small pictures (see lib/share.js
// and lib/ogImages.js): rounded counts and pre-shrunk images.
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

const { voteStep, cardVotesStat, cardBattleSplit } = await import("../lib/share.js");
const { shrinkForCard } = await import("../lib/ogImages.js");

test("vote counts round down to coarse steps", () => {
  const cases = [[0, 0], [49, 0], [50, 50], [99, 50], [100, 100], [249, 100], [250, 250], [499, 250], [500, 500], [999, 500], [1000, 1000], [2600, 2500], [7000, 5000], [12000, 10000], [-5, 0], [undefined, 0]];
  for (const [n, step] of cases) assert.equal(voteStep(n), step, `voteStep(${n})`);
});

test("card votes pill is empty below 50, then N+ votes", () => {
  assert.equal(cardVotesStat(12), "");
  assert.equal(cardVotesStat(73), "50+ votes");
  assert.equal(cardVotesStat(1248), "1,000+ votes");
});

test("battle split rounds to 10% and waits for enough votes", () => {
  assert.deepEqual(cardBattleSplit(10, 5), { va: "", vb: "" });
  assert.deepEqual(cardBattleSplit(62, 38), { va: 60, vb: 40 });
  assert.deepEqual(cardBattleSplit(64, 36), { va: 60, vb: 40 });
  assert.deepEqual(cardBattleSplit(100, 0), { va: 100, vb: 0 });
});

test("most votes leave the card address unchanged", () => {
  const seen = new Set();
  for (let v = 0; v <= 2000; v++) seen.add(`${cardVotesStat(v)}|${JSON.stringify(cardBattleSplit(Math.round(v * 0.6), v - Math.round(v * 0.6)))}`);
  assert.ok(seen.size <= 8, `2,000 votes produced ${seen.size} different cards`);
});

test("battle pictures are shrunk to one card half", async () => {
  const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#336699" } }).jpeg({ quality: 95 }).toBuffer();
  const small = await shrinkForCard(big);
  const meta = await sharp(small).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, 600);
  assert.equal(meta.height, 630);
  assert.ok(small.length < big.length);
  assert.equal(await shrinkForCard(Buffer.from("not an image")), null);
});
