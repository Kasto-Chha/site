// Trending + Discussion share cards (lib/ogCards.js, lib/ogResponse.js). These run
// the real card code on the real image engine; only the downloads of the font
// and logo files are faked (served from /public). What matters: the cards render
// at the right size, the topic's own labels reach the picture, long text can't
// break it, a failed asset download degrades instead of failing, and the
// homepage's address (which has no type) is left alone.

import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const { renderCard } = await import("../lib/ogResponse.js");
const { resetOgAssetCache } = await import("../lib/ogAssets.js");
const { clipText, resolveLabels, titleFontSize, pillFontSize, LABEL_DEFAULTS, battleSplit, battleTitleLayout, hasDevanagari, buildTrendingCard, buildDiscussionCard, buildHomeCard, DISCUSSION_LINE, QUESTION_LINE } = await import("../lib/ogCards.js");
const { ogImagePath, experiencesStat, votesStat, answersStat, threadShareInfo } = await import("../lib/share.js");

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
const STORAGE = "https://abc.supabase.co/storage/v1/object/public/Battle%20Images";
const pictures = new Map(); // address -> { bytes, type }
const fetched = []; // every address the card code asked for
const fetchInits = []; // and the options each request was made with

const realFetch = globalThis.fetch;
const realConsoleError = console.error;
const publicDir = path.resolve("public");

function serveAssetsFromDisk() {
  globalThis.fetch = async (url, init) => {
    fetched.push(String(url));
    fetchInits.push({ url: String(url), init });
    if (pictures.has(String(url))) {
      const { bytes, type } = pictures.get(String(url));
      return new Response(bytes, { status: 200, headers: { "content-type": type } });
    }
    const file = path.join(publicDir, new URL(String(url)).pathname);
    if (!fs.existsSync(file)) return new Response("not found", { status: 404 });
    return new Response(fs.readFileSync(file));
  };
}

beforeEach(() => {
  pictures.clear();
  fetched.length = 0;
  fetchInits.length = 0;
  resetOgAssetCache();
  serveAssetsFromDisk();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realConsoleError;
});

async function draw(params) {
  const url = `https://kastochhanepal.com/api/og?${new URLSearchParams(params).toString()}`;
  const res = await renderCard(new Request(url));
  if (!res) return null;
  assert.equal(res.headers.get("content-type"), "image/png");
  return Buffer.from(await res.arrayBuffer());
}

async function assertCardSize(png) {
  const meta = await sharp(png).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
}

// Counts dark pixels in a strip of the card. The tints and the big watermark shapes
// are all light, so only real text, or the black pill, registers.
async function darkPixels(png, region) {
  const { data } = await sharp(png).extract(region).greyscale().raw().toBuffer({ resolveWithObject: true });
  let dark = 0;
  for (const value of data) if (value < 175) dark += 1;
  return dark;
}
const footerArea = { left: 580, top: 515, width: 550, height: 36 };
const pillArea = { left: 72, top: 505, width: 330, height: 50 };

const TOPIC = { type: "trending", kicker: "General", title: "Balen Government's 6-month performance", stat: "1,248 votes" };

test("clipText, resolveLabels and the size rules", () => {
  assert.equal(clipText("short", 21), "short");
  assert.equal(clipText("x".repeat(30), 21).length, 21);
  assert.ok(clipText("x".repeat(30), 21).endsWith("\u2026"));
  assert.deepEqual(resolveLabels(undefined), LABEL_DEFAULTS);
  assert.deepEqual(resolveLabels(["Ramro", "  ", ""]), ["Ramro", "Thikai Chha", "Thik Chhaina"]);
  assert.equal(resolveLabels(["a".repeat(40), "b", "c"])[0].length, 21);
  assert.equal(titleFontSize(38), 72);
  assert.equal(titleFontSize(60), 62);
  assert.equal(titleFontSize(100), 54);
  assert.equal(pillFontSize(10), 30);
  assert.equal(pillFontSize(16), 26);
  assert.equal(pillFontSize(21), 23);
});

test("the card address carries the topic's labels, and is unchanged without them", () => {
  const withLabels = ogImagePath({ type: "trending", title: "T", labels: ["Ramro Chha", "Thikai Chha", "Ramro Chhaina"] });
  const params = new URL(withLabels, "https://x.test").searchParams;
  assert.equal(params.get("l1"), "Ramro Chha");
  assert.equal(params.get("l3"), "Ramro Chhaina");
  assert.equal(new URL(ogImagePath({ type: "trending", title: "T", labels: ["a".repeat(60)] }), "https://x.test").searchParams.get("l1").length, 40);
  // No labels: byte-for-byte the address the site has always produced.
  assert.equal(ogImagePath({ type: "battle", kicker: "K", title: "T", subtitle: "S", stat: "9" }), "/api/og?type=battle&kicker=K&title=T&subtitle=S&stat=9");
  assert.equal(ogImagePath({ type: "trending", title: "T", labels: ["", "  ", null] }), "/api/og?type=trending&title=T");
});

test("a Trending card renders at 1200x630", async () => {
  const png = await draw(TOPIC);
  await assertCardSize(png);
  assert.ok(png.length > 20_000, `unexpectedly small: ${png.length}`);
});

test("the topic's own labels change the picture", async () => {
  const defaults = await draw(TOPIC);
  const custom = await draw({ ...TOPIC, l1: "Ramro Chha", l2: "Thikai Chha", l3: "Ramro Chhaina" });
  assert.ok(!defaults.equals(custom), "custom labels produced the same image as the defaults");
});

test("very long labels and a very long title still render", async () => {
  const png = await draw({
    ...TOPIC,
    title: "Kathmandu ma sasto ghar bhada ko samasya ra sarkar ko bhumika kasto chha ra kina yesto bhayo hola",
    l1: "Ekdam ramro chha, support garchhu",
    l2: "Kehi thik kehi nathik chha",
    l3: "Bilkul thik chhaina, change chahincha"
  });
  await assertCardSize(png);
});

test("a Discussion card renders, and differs from a Trending card", async () => {
  const discussion = await draw({ type: "discussions", kicker: "Automobiles", title: "BYD Atto 3: battery kati barsa tikchha?", subtitle: "12 experiences shared on BYD Atto 3", stat: "48 likes" });
  await assertCardSize(discussion);
  assert.ok(!discussion.equals(await draw(TOPIC)));
});

test("neither card has a footer line, and both keep their pill at the bottom left", async () => {
  const trending = await draw(TOPIC);
  const discussion = await draw({ type: "discussions", kicker: "Automobiles", title: "BYD Atto 3", stat: "12 experiences shared" });
  assert.equal(await darkPixels(trending, footerArea), 0, "Trending has text where a footer used to be");
  assert.equal(await darkPixels(discussion, footerArea), 0, "Discussion has text where a footer used to be");
  assert.ok((await darkPixels(trending, pillArea)) > 1500, "Trending's votes pill is missing");
  assert.ok((await darkPixels(discussion, pillArea)) > 1500, "Discussion's pill is missing");
});

test("if the fonts and logo can't be downloaded, the card still renders", async () => {
  console.error = () => {};
  globalThis.fetch = async () => {
    throw new Error("network down");
  };
  await assertCardSize(await draw(TOPIC));
  await assertCardSize(await draw({ type: "discussions", title: "Still works", stat: "1 like" }));
});

test("a missing file (404) degrades the same way", async () => {
  console.error = () => {};
  globalThis.fetch = async () => new Response("nope", { status: 404 });
  await assertCardSize(await draw(TOPIC));
});

test("the homepage's address (no type) and the other card types are left to the route", async () => {
  assert.equal(await draw({ kicker: "Nepal's Independent Community-Powered Review Platform", title: "Nepal ma sabai kura... KastoChha?" }), null);
  for (const type of ["battles", "featured", "somethingelse"]) {
    assert.equal(await draw({ type, title: "x" }), null, `type=${type} was taken over`);
  }
});

test("the type is case-insensitive, like the route's own", async () => {
  await assertCardSize(await draw({ ...TOPIC, type: "Trending" }));
});

test("the Discussion pill wording: singular, plural, separators, and never negative", () => {
  assert.equal(experiencesStat(1), "1 experience shared");
  assert.equal(experiencesStat(12), "12 experiences shared");
  assert.equal(experiencesStat(1240), "1,240 experiences shared");
  assert.equal(experiencesStat(0), "0 experiences shared");
  assert.equal(experiencesStat(undefined), "0 experiences shared");
  assert.equal(experiencesStat(-4), "0 experiences shared");
});

// ---------- Battle card ----------
async function picture(color, format = "jpeg", width = 365, height = 512) {
  const base = sharp({ create: { width, height, channels: 3, background: color } });
  return format === "png" ? base.png().toBuffer() : format === "webp" ? base.webp().toBuffer() : base.jpeg().toBuffer();
}
const BATTLE = { type: "battle", title: "inDrive vs Yango", a: "inDrive", b: "Yango" };
const withPictures = { ...BATTLE, ia: `${STORAGE}/indrive.jpg`, ib: `${STORAGE}/yango.png` };

test("a Battle card renders at 1200x630 with no pictures at all (the battle's colours)", async () => {
  await assertCardSize(await draw(BATTLE));
});

test("real JPEG and PNG pictures from our own storage are used", async () => {
  pictures.set(`${STORAGE}/indrive.jpg`, { bytes: await picture("#e0a030", "jpeg"), type: "image/jpeg" });
  pictures.set(`${STORAGE}/yango.png`, { bytes: await picture("#3050c0", "png"), type: "image/png" });
  const withPics = await draw(withPictures);
  await assertCardSize(withPics);
  assert.ok(!withPics.equals(await draw(BATTLE)), "the pictures made no difference");
  assert.ok(fetched.some((u) => u.endsWith("indrive.jpg")) && fetched.some((u) => u.endsWith("yango.png")));
});

test("pictures from anywhere but our own storage are never even requested", async () => {
  const outside = [
    "https://evil.example.com/storage/v1/object/public/x.jpg",
    "http://abc.supabase.co/storage/v1/object/public/x.jpg",
    "https://abc.supabase.co/private/x.jpg",
    "https://abc.supabase.co.evil.com/storage/v1/object/public/x.jpg",
    "file:///etc/passwd",
    "not a url"
  ];
  for (const address of outside) pictures.set(address, { bytes: await picture("#ff0000"), type: "image/jpeg" });
  const png = await draw({ ...BATTLE, ia: outside[0], ib: outside[1] });
  await draw({ ...BATTLE, ia: outside[2], ib: outside[3] });
  await draw({ ...BATTLE, ia: outside[4], ib: outside[5] });
  for (const address of outside) assert.ok(!fetched.includes(address), `fetched ${address}`);
  assert.ok(png.equals(await draw(BATTLE)), "a refused picture changed the card");
});

test("WebP, junk bytes, a 404 and a failed download all fall back to the colours", async () => {
  console.error = () => {};
  const plain = await draw(BATTLE);
  pictures.set(`${STORAGE}/a.webp`, { bytes: await picture("#00ff00", "webp"), type: "image/webp" });
  pictures.set(`${STORAGE}/b.jpg`, { bytes: Buffer.from("this is not an image at all"), type: "image/jpeg" });
  assert.ok((await draw({ ...BATTLE, ia: `${STORAGE}/a.webp`, ib: `${STORAGE}/b.jpg` })).equals(plain), "a WebP or junk file changed the card");
  assert.ok((await draw({ ...BATTLE, ia: `${STORAGE}/missing.jpg`, ib: `${STORAGE}/missing2.png` })).equals(plain), "a 404 changed the card");
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/storage/")) throw new Error("network down");
    return real(url);
  };
  assert.ok((await draw({ ...BATTLE, ia: `${STORAGE}/c.jpg`, ib: `${STORAGE}/d.png` })).equals(plain), "a network error changed the card");
});

test("a picture over 2 MB is skipped", async () => {
  pictures.set(`${STORAGE}/huge.jpg`, { bytes: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2 * 1024 * 1024 + 10)]), type: "image/jpeg" });
  assert.ok((await draw({ ...BATTLE, ia: `${STORAGE}/huge.jpg` })).equals(await draw(BATTLE)));
});

test("names come from a/b, or from an old link's 'X vs Y' title", async () => {
  const fromParams = await draw({ type: "battle", title: "ignored", a: "inDrive", b: "Yango" });
  const fromTitle = await draw({ type: "battle", title: "inDrive vs Yango" });
  const fromTitleDots = await draw({ type: "battle", title: "inDrive VS. Yango" });
  assert.ok(fromParams.equals(fromTitle), "an old-style link drew different names");
  assert.ok(fromTitle.equals(fromTitleDots));
  assert.ok(!fromTitle.equals(await draw({ type: "battle", title: "Ncell vs NTC" })));
});

test("saved colours are used when valid, ignored when not", async () => {
  const dflt = await draw(BATTLE);
  assert.ok(!(await draw({ ...BATTLE, ca: "#1E7A46", cb: "#A8650B" })).equals(dflt), "valid colours made no difference");
  assert.ok((await draw({ ...BATTLE, ca: "red; background:url(x)", cb: "javascript:alert(1)" })).equals(dflt), "an invalid colour got through");
});

test("very long names still render", async () => {
  await assertCardSize(await draw({ type: "battle", title: "x", a: "A very long company name that goes on and on", b: "Another extremely long competitor name" }));
});

test("the share helper carries the battle's names, pictures and colours", () => {
  const url = new URL(ogImagePath({ type: "battle", title: "T", battle: { a: "inDrive", b: "Yango", ia: `${STORAGE}/i.jpg`, ib: "", ca: "#fff", cb: null } }), "https://x.test");
  assert.equal(url.searchParams.get("a"), "inDrive");
  assert.equal(url.searchParams.get("ia"), `${STORAGE}/i.jpg`);
  assert.equal(url.searchParams.get("ca"), "#fff");
  assert.equal(url.searchParams.get("ib"), null);
  assert.equal(url.searchParams.get("cb"), null);
  assert.equal(ogImagePath({ type: "battle", title: "T" }), "/api/og?type=battle&title=T");
});

test("the vote split: rounding, an even start, and never negative", () => {
  assert.deepEqual(battleSplit(62, 38), { left: 62, right: 38 });
  assert.deepEqual(battleSplit(1, 2), { left: 33, right: 67 });
  assert.deepEqual(battleSplit(1, 0), { left: 100, right: 0 });
  assert.equal(battleSplit(0, 0), null);
  assert.equal(battleSplit(undefined, "x"), null);
  assert.equal(battleSplit(-5, 10)?.left, 0);
  const odd = battleSplit(1, 1);
  assert.equal(odd.left + odd.right, 100);
});

test("the votes badge wording: singular, plural, separators", () => {
  assert.equal(votesStat(0), "0 votes");
  assert.equal(votesStat(1), "1 vote");
  assert.equal(votesStat(1248), "1,248 votes");
  assert.equal(votesStat(undefined), "0 votes");
  assert.equal(votesStat(-3), "0 votes");
});

test("a Battle card's votes change the picture; no votes means an even bar and no percentages", async () => {
  const none = await draw(BATTLE);
  const zero = await draw({ ...BATTLE, va: "0", vb: "0" });
  const split = await draw({ ...BATTLE, va: "62", vb: "38" });
  const other = await draw({ ...BATTLE, va: "10", vb: "90" });
  assert.ok(none.equals(zero), "zero votes should look like no vote data");
  assert.ok(!split.equals(none));
  assert.ok(!split.equals(other), "different splits drew the same card");
  await assertCardSize(split);
});

test("the Battle votes badge shows a plain 'N votes' and ignores anything else", async () => {
  const none = await draw(BATTLE);
  assert.ok(!(await draw({ ...BATTLE, stat: "2,341 votes" })).equals(none), "the votes badge was not drawn");
  assert.ok(!(await draw({ ...BATTLE, stat: "1 vote" })).equals(none));
  // An old shared link carried "62% X · 38% Y" in this slot; it must not become the badge.
  assert.ok((await draw({ ...BATTLE, stat: "62% inDrive \u00b7 38% Yango" })).equals(none), "an old-style stat was drawn");
  assert.ok((await draw({ ...BATTLE, stat: "<script>alert(1)</script> votes" })).equals(none));
});

test("the share helper carries the battle's vote counts", () => {
  const url = new URL(ogImagePath({ type: "battle", title: "T", battle: { a: "A", b: "B", va: 62, vb: 38 } }), "https://x.test");
  assert.equal(url.searchParams.get("va"), "62");
  assert.equal(url.searchParams.get("vb"), "38");
});

test("the Battle title fits: one line when short, two lines when long, never absurdly small", () => {
  assert.deepEqual(battleTitleLayout("inDrive", "Yango"), { lines: ["inDrive vs Yango"], size: 88 });
  const long = battleTitleLayout("Ncell Axiata Limited", "Nepal Telecom (NTC)");
  assert.equal(long.lines.length, 2);
  assert.equal(long.lines[1], "vs Nepal Telecom (NTC)");
  // Every combination the 24-character name limit allows must fit the 1056px line.
  for (let a = 1; a <= 24; a++) {
    for (let b = 1; b <= 24; b++) {
      const { lines, size } = battleTitleLayout("x".repeat(a), "y".repeat(b));
      assert.ok(size >= 40 && size <= 88, `size ${size} for ${a}/${b}`);
      for (const line of lines) assert.ok(line.length * (0.54 * size - 2) <= 1056 + 1, `${a}/${b}: "${line}" at ${size}px is too wide`);
    }
  }
});

test("the homepage card renders at 1200x630, takes no text, and survives failed downloads", async () => {
  const home = await draw({ type: "home" });
  await assertCardSize(home);
  // It has no text inputs, so the old address's extra parameters change nothing.
  assert.ok(home.equals(await draw({ type: "home", kicker: "anything", title: "anything else" })));
  console.error = () => {};
  globalThis.fetch = async () => {
    throw new Error("network down");
  };
  await assertCardSize(await draw({ type: "home" }));
});

test("the homepage tagline's emoji are embedded: nothing is fetched from outside this site", async () => {
  await draw({ type: "home" });
  assert.ok(fetched.length > 0);
  for (const address of fetched) assert.ok(address.startsWith("https://kastochhanepal.com/"), `reached outside the site: ${address}`);
  const { EMOJI } = await import("../lib/ogEmoji.js");
  assert.deepEqual(Object.keys(EMOJI).sort(), ["car", "dumpling", "phone", "weather"]);
  for (const [name, uri] of Object.entries(EMOJI)) {
    assert.match(uri, /^data:image\/png;base64,/, name);
    const bytes = Buffer.from(uri.split(",")[1], "base64");
    assert.equal(bytes.subarray(1, 4).toString(), "PNG", `${name} is not a PNG`);
    assert.ok(bytes.length > 500 && bytes.length < 20_000, `${name} is ${bytes.length} bytes`);
  }
});

test("the homepage tagline text, and every emoji it names exists", async () => {
  const { HOME_TAGLINE } = await import("../lib/ogCards.js");
  const { EMOJI } = await import("../lib/ogEmoji.js");
  assert.equal(HOME_TAGLINE.flat().map(([, text]) => text).join(" "), "Momo Dekhi Mausam Samma, Gaadi Dekhi Gadget Samma.");
  for (const [emoji] of HOME_TAGLINE.flat()) assert.ok(EMOJI[emoji], `no picture for ${emoji}`);
});

test("answers wording: none, one, many, separators", () => {
  assert.equal(answersStat(0), "No answers yet");
  assert.equal(answersStat(1), "1 answer");
  assert.equal(answersStat(3), "3 answers");
  assert.equal(answersStat(1200), "1,200 answers");
  assert.equal(answersStat(undefined), "No answers yet");
  assert.equal(answersStat(-2), "No answers yet");
});

test("a thread that opens with a question counts answers, not experiences", () => {
  const ask = { kind: "question" }, reply = { kind: "experience" };
  assert.deepEqual(
    (({ kind, stat }) => ({ kind, stat }))(threadShareInfo([ask], "X")),
    { kind: "question", stat: "No answers yet" }
  );
  assert.equal(threadShareInfo([ask, reply], "X").stat, "1 answer");
  assert.equal(threadShareInfo([ask, reply, reply, reply], "X").stat, "3 answers");
  assert.match(threadShareInfo([ask], "BYD Atto 3").description, /^BYD Atto 3 \u2014 a question asked on KastoChha\. No answers yet/);
  assert.match(threadShareInfo([ask, reply, reply], "BYD Atto 3").description, /2 answers so far/);
});

test("an ordinary thread is described exactly as it always was", () => {
  const post = { kind: "experience" };
  const info = threadShareInfo([post, post, post], "BYD Atto 3");
  assert.equal(info.kind, "experience");
  assert.equal(info.stat, "3 experiences shared");
  assert.equal(info.description, "3 experiences shared on BYD Atto 3 \u2014 real opinions from people in Nepal, with votes and replies.");
  assert.equal(threadShareInfo([post], "X").description.startsWith("1 experience shared on X"), true);
  // Rows from before the kind column existed, or no rows at all, stay ordinary.
  assert.equal(threadShareInfo([{}], "X").kind, "experience");
  assert.equal(threadShareInfo([], "X").stat, "0 experiences shared");
  assert.equal(threadShareInfo(undefined, "X").kind, "experience");
});

test("the card address marks a question thread, and only that", () => {
  assert.equal(new URL(ogImagePath({ type: "discussions", title: "T", kind: "question" }), "https://x.test").searchParams.get("kind"), "question");
  assert.equal(ogImagePath({ type: "discussions", title: "T", kind: "experience" }), "/api/og?type=discussions&title=T");
  assert.equal(ogImagePath({ type: "discussions", title: "T" }), "/api/og?type=discussions&title=T");
});

test("a Question card renders, differs from a Discussion card, and an unknown kind is ignored", async () => {
  const params = { type: "discussions", kicker: "Automobiles", title: "BYD Atto 3: battery kati barsa tikchha?" };
  const discussion = await draw({ ...params, stat: "12 experiences shared" });
  const question = await draw({ ...params, stat: "3 answers", kind: "question" });
  await assertCardSize(question);
  assert.ok(!question.equals(discussion));
  assert.ok((await draw({ ...params, stat: "12 experiences shared", kind: "garbage" })).equals(discussion), "an unknown kind changed the card");
  await assertCardSize(await draw({ ...params, stat: "No answers yet", kind: "question" }));
});

// ---------- making sure link-preview bots get the images ----------
const { finalizeImage, defaultCardResponse, CARD_CACHE_CONTROL } = await import("../lib/ogFinalize.js");
const { GET: robotsGet } = await import("../app/robots.txt/route.js");
const { shareMetadata } = await import("../lib/share.js");

test("a finished card is sent whole: exact size, image content type, a day of caching", async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#c8102e" } }).png().toBuffer();
  const res = await finalizeImage(new Response(png, { status: 200 }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(res.headers.get("content-length"), String(png.length));
  assert.equal(res.headers.get("cache-control"), CARD_CACHE_CONTROL);
  assert.match(CARD_CACHE_CONTROL, /s-maxage=86400/);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), png);
});

test("a failed or empty render is refused, so the caller can fall back", async () => {
  await assert.rejects(finalizeImage(new Response("boom", { status: 500 })));
  await assert.rejects(finalizeImage(new Response(new Uint8Array(0), { status: 200 })));
  await assert.rejects(finalizeImage(undefined));
  const broken = new Response(new ReadableStream({ start(controller) { controller.error(new Error("render blew up")); } }));
  await assert.rejects(finalizeImage(broken));
});

test("when a card can't be drawn, a bot is given the default image, not an error", async () => {
  const defaults = fs.readFileSync(path.join(publicDir, "og-home.png"));
  const res = await defaultCardResponse("https://kastochhanepal.com");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(res.headers.get("x-share-card"), "default");
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), defaults);
  // And if even that can't be fetched, a plain unavailable answer, never cached.
  console.error = () => {};
  globalThis.fetch = async () => new Response("nope", { status: 404 });
  const none = await defaultCardResponse("https://kastochhanepal.com");
  assert.equal(none.status, 503);
  assert.equal(none.headers.get("cache-control"), "no-store");
});

// Google's rule: the longest matching path wins, and Allow wins a tie.
function robotsAllows(body, urlPath) {
  let best = { length: -1, allow: true };
  for (const line of body.split("\n")) {
    const m = line.match(/^(Allow|Disallow):\s*(\S*)/i);
    if (!m || !m[2] || !urlPath.startsWith(m[2])) continue;
    const allow = m[1].toLowerCase() === "allow";
    if (m[2].length > best.length || (m[2].length === best.length && allow)) best = { length: m[2].length, allow };
  }
  return best.allow;
}

test("robots.txt lets bots fetch the share images but keeps the rest of /api and /admin closed", async () => {
  const body = await (await robotsGet()).text();
  assert.ok(robotsAllows(body, "/api/og?type=trending&title=x"), "the share image route is blocked");
  assert.ok(robotsAllows(body, "/api/og"));
  assert.ok(robotsAllows(body, "/og-home.png"));
  assert.ok(robotsAllows(body, "/discussions/anything"));
  assert.ok(!robotsAllows(body, "/api/chat"), "the rest of /api should stay closed");
  assert.ok(!robotsAllows(body, "/api/admin/roles"));
  assert.ok(!robotsAllows(body, "/admin"));
  assert.match(body, /Sitemap: /);
});

test("the homepage's share image is a static file that matches the card design", async () => {
  const file = path.join(publicDir, "og-home.png");
  const meta = await sharp(file).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
  assert.ok(fs.statSync(file).size < 300_000, "the static image is heavier than it should be");
  // It must not drift from the code that draws the card (tolerance for engine rounding).
  const fresh = await draw({ type: "home" });
  const a = await sharp(file).removeAlpha().raw().toBuffer();
  const b = await sharp(fresh).removeAlpha().raw().toBuffer();
  assert.equal(a.length, b.length);
  let total = 0;
  for (let i = 0; i < a.length; i += 7) total += Math.abs(a[i] - b[i]);
  assert.ok(total / Math.ceil(a.length / 7) < 2, "public/og-home.png is out of date: regenerate it from the homepage card");
});

test("the layout points the whole site's default card at the static file", () => {
  const source = fs.readFileSync(path.resolve("app/layout.js"), "utf8");
  assert.equal(source.split('"/og-home.png"').length - 1, 2, "expected the Open Graph and Twitter images");
  assert.ok(!source.includes("/api/og?type=home"));
  assert.match(source, /type: "image\/png"/);
});

test("each page's own card is declared as a PNG with its size", () => {
  const meta = shareMetadata({ type: "trending", path: "/trending/x", title: "T", description: "D" });
  assert.deepEqual(meta.openGraph.images[0], { url: meta.openGraph.images[0].url, type: "image/png", width: 1200, height: 630, alt: "T" });
  assert.ok(meta.openGraph.images[0].url.startsWith("/api/og?"));
});

test("Discussion and Question cards never draw a summary sentence, even when the address carries one", async () => {
  const bare = { type: "discussions", kicker: "Motors", title: "TVS Ntorq (RTFi)", stat: "1 experience shared" };
  const sentence = "1 experience shared on TVS Ntorq (RTFi) \u2014 real opinions from people in Nepal, with votes and replies.";
  assert.ok((await draw({ ...bare, subtitle: sentence })).equals(await draw(bare)), "a Discussion card drew the summary sentence");
  const question = { ...bare, stat: "No answers yet", kind: "question" };
  assert.ok((await draw({ ...question, subtitle: sentence })).equals(await draw(question)), "a Question card drew the summary sentence");
});

test("the address the discussion page really builds draws the same card as the bare one", async () => {
  const thread = [{ kind: "experience" }];
  const info = threadShareInfo(thread, "TVS Ntorq (RTFi)");
  const meta = shareMetadata({ type: "discussions", path: "/discussions/tvs-ntorq", title: "TVS Ntorq (RTFi)", description: info.description, kicker: "Motors", stat: info.stat, kind: info.kind });
  const real = new URL(meta.openGraph.images[0].url, "https://kastochhanepal.com");
  assert.ok(real.searchParams.get("subtitle"), "expected the page to send its description along");
  const fromPage = await renderCard(new Request(real.toString()));
  const bare = await draw({ type: "discussions", kicker: "Motors", title: "TVS Ntorq (RTFi)", stat: "1 experience shared" });
  assert.ok(Buffer.from(await fromPage.arrayBuffer()).equals(bare), "the page's own address draws a different card from the designed one");
});

test("the address the Trending page really builds draws the designed Trending card", async () => {
  const prompt = "Balen sarkar ko 6 mahina \u2014 kasto lagyo?";
  const meta = shareMetadata({
    type: "trending",
    path: "/trending/balen-government",
    title: "Balen Government's 6-month performance",
    description: prompt,
    kicker: "General",
    stat: votesStat(1248),
    labels: ["Ramro Chha", "Thikai Chha", "Ramro Chhaina"]
  });
  const real = await renderCard(new Request(new URL(meta.openGraph.images[0].url, "https://kastochhanepal.com").toString()));
  const bare = await draw({ type: "trending", kicker: "General", title: "Balen Government's 6-month performance", subtitle: prompt, stat: "1,248 votes", l1: "Ramro Chha", l2: "Thikai Chha", l3: "Ramro Chhaina" });
  assert.ok(Buffer.from(await real.arrayBuffer()).equals(bare), "the page's own address draws a different card from the designed one");
});

test("the address the Battle page really builds draws the designed Battle card", async () => {
  const meta = shareMetadata({
    type: "battle",
    path: "/battle/indrive-vs-yango",
    title: "inDrive vs Yango",
    description: "Ride sharing battle \u2014 vote and see what Nepal thinks.",
    kicker: "Ride sharing",
    stat: votesStat(2341),
    battle: { a: "inDrive", b: "Yango", ia: "", ib: "", ca: "#1E7A46", cb: "#A8650B", va: 1451, vb: 890 }
  });
  const real = await renderCard(new Request(new URL(meta.openGraph.images[0].url, "https://kastochhanepal.com").toString()));
  const bare = await draw({ type: "battle", title: "inDrive vs Yango", a: "inDrive", b: "Yango", ca: "#1E7A46", cb: "#A8650B", va: "1451", vb: "890", stat: "2,341 votes" });
  assert.ok(Buffer.from(await real.arrayBuffer()).equals(bare), "the page's own address draws a different card from the designed one");
});

// ---------- Battle pictures: the rules, and the reasons ----------
const { resolveBattlePicture, loadBattleImage } = await import("../lib/ogImages.js");

async function battleHeaderFor(params) {
  const url = `https://kastochhanepal.com/api/og?${new URLSearchParams({ type: "battle", title: "A vs B", a: "A", b: "B", ...params }).toString()}`;
  const res = await renderCard(new Request(url));
  await res.arrayBuffer();
  return res.headers.get("x-card-pictures");
}

test("which picture addresses are accepted, and the reason for each refusal", () => {
  const site = "https://kastochhanepal.com";
  assert.deepEqual(resolveBattlePicture("", site), { reason: "none" });
  assert.deepEqual(resolveBattlePicture(undefined, site), { reason: "none" });
  // our own files
  assert.equal(resolveBattlePicture("/battle-images/x.jpg", site).url, "https://kastochhanepal.com/battle-images/x.jpg");
  assert.equal(resolveBattlePicture("//evil.example.com/x.jpg", site).reason, "invalid-address");
  // this project's storage (any /storage/v1/ path), and nothing else on that host
  assert.ok(resolveBattlePicture(`${STORAGE}/x.jpg`, site).url);
  assert.ok(resolveBattlePicture("https://abc.supabase.co/storage/v1/render/image/public/b/x.jpg", site).url);
  assert.equal(resolveBattlePicture("https://abc.supabase.co/rest/v1/battles", site).reason, "path-not-storage");
  // everyone else
  assert.equal(resolveBattlePicture("http://abc.supabase.co/storage/v1/object/public/x.jpg", site).reason, "not-https");
  assert.equal(resolveBattlePicture("https://evil.example.com/x.jpg", site).reason, "host-not-approved");
  assert.equal(resolveBattlePicture("https://abc.supabase.co.evil.com/storage/v1/x.jpg", site).reason, "host-not-approved");
  assert.equal(resolveBattlePicture("not a url", site).reason, "invalid-address");
});

test("a host the site already approves for images is accepted, and only that host", () => {
  process.env.OPTIMIZED_IMAGE_HOSTS = "i.ytimg.com, Cdn.Example.com";
  try {
    assert.ok(resolveBattlePicture("https://cdn.example.com/a/b.png", "https://kastochhanepal.com").url);
    assert.ok(resolveBattlePicture("https://i.ytimg.com/vi/x/hq.jpg", "https://kastochhanepal.com").url);
    assert.equal(resolveBattlePicture("https://other.example.com/b.png", "https://kastochhanepal.com").reason, "host-not-approved");
  } finally {
    delete process.env.OPTIMIZED_IMAGE_HOSTS;
  }
});

test("with no Supabase address and no approved hosts configured, the reason says so", () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    assert.equal(resolveBattlePicture(`${STORAGE}/x.jpg`, "https://kastochhanepal.com").reason, "no-approved-hosts");
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  }
});

test("a picture on this site's own path is fetched and used", async () => {
  pictures.set("https://kastochhanepal.com/battle-images/x.png", { bytes: await picture("#2db84c", "png"), type: "image/png" });
  const used = await draw({ ...BATTLE, ia: "/battle-images/x.png" });
  assert.ok(!used.equals(await draw(BATTLE)), "a picture on this site's own path was ignored");
  assert.equal(await battleHeaderFor({ ia: "/battle-images/x.png" }), "left=ok; right=none");
});

test("GIF pictures are drawn; WebP, AVIF and TIFF are refused by name", async () => {
  const gif = await sharp({ create: { width: 40, height: 60, channels: 3, background: "#ff8800" } }).gif().toBuffer();
  const webp = await picture("#00ff00", "webp");
  const avif = await sharp({ create: { width: 40, height: 60, channels: 3, background: "#0000ff" } }).avif().toBuffer();
  const tiff = await sharp({ create: { width: 40, height: 60, channels: 3, background: "#aa00aa" } }).tiff().toBuffer();
  pictures.set(`${STORAGE}/a.gif`, { bytes: gif, type: "image/gif" });
  pictures.set(`${STORAGE}/a.webp`, { bytes: webp, type: "image/webp" });
  pictures.set(`${STORAGE}/a.avif`, { bytes: avif, type: "image/avif" });
  pictures.set(`${STORAGE}/a.tiff`, { bytes: tiff, type: "image/tiff" });
  assert.equal(await battleHeaderFor({ ia: `${STORAGE}/a.gif` }), "left=ok; right=none");
  assert.equal(await battleHeaderFor({ ia: `${STORAGE}/a.webp` }), "left=unsupported-format:webp; right=none");
  assert.equal(await battleHeaderFor({ ia: `${STORAGE}/a.avif` }), "left=unsupported-format:avif; right=none");
  assert.equal(await battleHeaderFor({ ia: `${STORAGE}/a.tiff` }), "left=unsupported-format:tiff; right=none");
});

test("the card reports why each side's picture was or wasn't used", async () => {
  console.error = () => {};
  pictures.set(`${STORAGE}/good.jpg`, { bytes: await picture("#e0a030", "jpeg"), type: "image/jpeg" });
  pictures.set(`${STORAGE}/big.jpg`, { bytes: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2 * 1024 * 1024 + 10)]), type: "image/jpeg" });
  assert.equal(await battleHeaderFor({ ia: `${STORAGE}/good.jpg`, ib: `${STORAGE}/missing.jpg` }), "left=ok; right=fetch-failed:404");
  assert.equal(await battleHeaderFor({ ia: "https://evil.example.com/x.jpg", ib: `${STORAGE}/big.jpg` }), "left=host-not-approved; right=too-large");
  assert.equal(await battleHeaderFor({}), "left=none; right=none");
  assert.equal(await battleHeaderFor({ ia: "http://abc.supabase.co/storage/v1/x.jpg", ib: "garbage" }), "left=not-https; right=invalid-address");
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/storage/")) throw new Error("network down");
    return real(url);
  };
  assert.equal(await battleHeaderFor({ ia: `${STORAGE}/c.jpg` }), "left=fetch-error:request:Error:network down; right=none");
});

test("the finalizer keeps the card's own X-Card-* notes and nothing else of its headers", async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#c8102e" } }).png().toBuffer();
  const res = await finalizeImage(new Response(png, { status: 200, headers: { "X-Card-Pictures": "left=ok; right=none", "X-Secret": "nope", "Content-Type": "text/plain" } }));
  assert.equal(res.headers.get("x-card-pictures"), "left=ok; right=none");
  assert.equal(res.headers.get("x-secret"), null);
  assert.equal(res.headers.get("content-type"), "image/png");
});

// ---------- the lines on the cards ----------
// Every piece of text a card draws, in order, read from its element tree.
function textsOf(node) {
  if (node === null || node === undefined || node === false) return [];
  if (typeof node === "string") return [node];
  const kids = node.props?.children;
  return (Array.isArray(kids) ? kids : [kids]).flatMap(textsOf);
}
const cardArgs = { title: "T", kicker: "K", stat: "S", logo: null };

test("the invitation lines are fixed: Discussion and Question each have their own", () => {
  assert.equal(DISCUSSION_LINE, "Got Something to Say? Join the Discussion!");
  assert.equal(QUESTION_LINE, "Got an Answer? Share It!");
  const discussion = textsOf(buildDiscussionCard(cardArgs));
  const question = textsOf(buildDiscussionCard({ ...cardArgs, question: true }));
  assert.ok(discussion.includes(DISCUSSION_LINE) && !discussion.includes(QUESTION_LINE));
  assert.ok(question.includes(QUESTION_LINE) && !question.includes(DISCUSSION_LINE));
});

test("a Trending card draws the topic's description, cut to one line, and nothing when there is none", () => {
  const labels = ["A", "B", "C"];
  const withNote = textsOf(buildTrendingCard({ ...cardArgs, labels, description: "NTC ra Ncell ko price increase \u2014 worth it ki overpriced?" }));
  assert.ok(withNote.includes("NTC ra Ncell ko price increase \u2014 worth it ki overpriced?"));
  const long = "word ".repeat(40).trim();
  const cut = textsOf(buildTrendingCard({ ...cardArgs, labels, description: long })).find((x) => x.endsWith("\u2026"));
  assert.ok(cut && cut.length <= 62, `the long description was not cut to one line: ${cut}`);
  for (const none of [undefined, "", "   "]) {
    const texts = textsOf(buildTrendingCard({ ...cardArgs, labels, description: none }));
    assert.deepEqual(texts, textsOf(buildTrendingCard({ ...cardArgs, labels })), `an empty description (${JSON.stringify(none)}) changed the card`);
  }
});

test("a description written in Devanagari is left off the card", () => {
  assert.equal(hasDevanagari("\u0928\u0947\u092a\u093e\u0932 \u092e\u093e"), true);
  assert.equal(hasDevanagari("Nepal ma sabai kura"), false);
  assert.equal(hasDevanagari("mixed \u0928\u0947\u092a\u093e\u0932 text"), true);
  assert.equal(hasDevanagari(undefined), false);
  const labels = ["A", "B", "C"];
  const texts = textsOf(buildTrendingCard({ ...cardArgs, labels, description: "\u0928\u0947\u092a\u093e\u0932 \u092e\u093e \u0938\u092c\u0948 \u0915\u0941\u0930\u093e" }));
  assert.deepEqual(texts, textsOf(buildTrendingCard({ ...cardArgs, labels })), "a Devanagari description was drawn");
});

test("a Trending card with a description renders; a Devanagari one matches a card without", async () => {
  const base = { type: "trending", kicker: "General", title: "NTC vs Ncell price increase", stat: "902 votes" };
  await assertCardSize(await draw({ ...base, subtitle: "NTC ra Ncell ko price increase \u2014 worth it ki overpriced?" }));
  assert.ok(!(await draw({ ...base, subtitle: "A real description" })).equals(await draw(base)), "the description made no difference");
  assert.ok((await draw({ ...base, subtitle: "\u0928\u0947\u092a\u093e\u0932 \u092e\u093e" })).equals(await draw(base)), "a Devanagari description changed the card");
});

test("the homepage pills read Ask, Explore, Share, in that order", () => {
  const pills = textsOf(buildHomeCard({ logo: null })).filter((x) => ["Ask", "Explore", "Share"].includes(x));
  assert.deepEqual(pills, ["Ask", "Explore", "Share"]);
});

// ---------- picture loading: the parts that must not depend on the server ----------
const { toBase64 } = await import("../lib/ogAssets.js");

test("base64 encoding is exact at every size, including around the chunk boundaries", () => {
  for (const size of [0, 1, 2, 3, 1023, 1024, 1025, 2047, 2048, 2049, 29069, 70000]) {
    const bytes = Buffer.alloc(size);
    for (let i = 0; i < size; i++) bytes[i] = (i * 31 + 7) % 256;
    assert.equal(toBase64(bytes), bytes.toString("base64"), `wrong at ${size} bytes`);
  }
});

test("encoding never hands one call more than a thousand-odd arguments", () => {
  const original = String.fromCharCode;
  let largest = 0;
  String.fromCharCode = function (...args) {
    largest = Math.max(largest, args.length);
    if (args.length > 2048) throw new RangeError("Maximum call stack size exceeded");
    return original.apply(String, args);
  };
  try {
    const bytes = Buffer.alloc(70000, 7);
    assert.equal(toBase64(bytes), bytes.toString("base64"));
    assert.ok(largest <= 1024, `one call took ${largest} arguments`);
  } finally {
    String.fromCharCode = original;
  }
});

const fakeResponse = (extra = {}) => ({ ok: true, status: 200, redirected: false, url: "", headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0), ...extra });
const toArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const onlyStorageFails = (make) => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).includes("/storage/") ? make(url, init) : real(url, init));
};

test("a failure says which step broke and with what error", async () => {
  console.error = () => {};
  onlyStorageFails(() => {
    throw new TypeError("fetch failed");
  });
  assert.equal(await battleHeaderFor({ ia: `${STORAGE}/a.jpg` }), "left=fetch-error:request:TypeError:fetch failed; right=none");

  onlyStorageFails(() => fakeResponse({ arrayBuffer: async () => { throw new Error("socket hang up"); } }));
  assert.equal(await battleHeaderFor({ ia: `${STORAGE}/a.jpg` }), "left=fetch-error:read:Error:socket hang up; right=none");

  const slow = Object.assign(new Error("timed out"), { name: "TimeoutError" });
  onlyStorageFails(() => { throw slow; });
  assert.equal(await battleHeaderFor({ ia: `${STORAGE}/a.jpg` }), "left=fetch-timeout; right=none");

  // encoding fails: make any large call to fromCharCode blow up, as a tight server might
  const jpeg = await picture("#e0a030", "jpeg");
  onlyStorageFails(() => fakeResponse({ arrayBuffer: async () => toArrayBuffer(jpeg) }));
  const original = String.fromCharCode;
  String.fromCharCode = function (...args) {
    if (args.length > 8) throw new RangeError("Maximum call stack size exceeded");
    return original.apply(String, args);
  };
  try {
    assert.equal(await battleHeaderFor({ ia: `${STORAGE}/a.jpg` }), "left=fetch-error:encode:RangeError:Maximum call stack size exceeded; right=none");
  } finally {
    String.fromCharCode = original;
  }
});

test("a header-unsafe error message is cleaned before it is reported", async () => {
  console.error = () => {};
  onlyStorageFails(() => {
    throw new Error("bad\r\nSet-Cookie: x=1; path=/ <script>");
  });
  const header = await battleHeaderFor({ ia: `${STORAGE}/a.jpg` });
  assert.ok(!/[\r\n<>]/.test(header), `unsafe characters in: ${header}`);
  assert.match(header, /^left=fetch-error:request:Error:/);
  assert.ok(header.length < 200);
});

test("a redirect is followed only while it stays on an approved address", async () => {
  const png = await picture("#2db84c", "png");
  onlyStorageFails(() => fakeResponse({ redirected: true, url: "https://evil.example.com/x.png", arrayBuffer: async () => toArrayBuffer(png) }));
  assert.equal(await battleHeaderFor({ ia: `${STORAGE}/a.png` }), "left=redirected-elsewhere; right=none");
  onlyStorageFails(() => fakeResponse({ redirected: true, url: `${STORAGE}/moved.png`, arrayBuffer: async () => toArrayBuffer(png) }));
  assert.equal(await battleHeaderFor({ ia: `${STORAGE}/a.png` }), "left=ok; right=none");
});

test("picture requests are plain: no 'redirect: error' option, which not every server accepts", async () => {
  pictures.set(`${STORAGE}/plain.png`, { bytes: await picture("#2db84c", "png"), type: "image/png" });
  assert.equal(await battleHeaderFor({ ia: `${STORAGE}/plain.png` }), "left=ok; right=none");
  const sent = fetchInits.filter((f) => f.url.includes("/storage/"));
  assert.ok(sent.length > 0);
  for (const { init } of sent) {
    assert.ok(!init || !("redirect" in init), "the picture request set a redirect option");
    assert.ok(init?.signal, "the picture request lost its timeout");
  }
});

// ---------- a picture the engine can't decode must never take the whole card down ----------
async function junkJpeg() {
  // Passes the card's checks (it starts like a JPEG) but is not a decodable image.
  const good = await picture("#e0a030", "jpeg");
  return Buffer.concat([good.subarray(0, 20), Buffer.alloc(3000, 7)]);
}

test("one undecodable picture is dropped and the other is kept, and the card is still drawn", async () => {
  console.error = () => {};
  pictures.set(`${STORAGE}/junk.jpg`, { bytes: await junkJpeg(), type: "image/jpeg" });
  pictures.set(`${STORAGE}/good.png`, { bytes: await picture("#3050c0", "png"), type: "image/png" });
  const params = { ...BATTLE, ia: `${STORAGE}/junk.jpg`, ib: `${STORAGE}/good.png` };
  const card = await draw(params);
  await assertCardSize(card);
  assert.equal(await battleHeaderFor({ ia: params.ia, ib: params.ib }), "left=render-failed; right=ok");
  assert.ok(!card.equals(await draw(BATTLE)), "the good picture was dropped along with the bad one");
});

test("two undecodable pictures leave a plain coloured card, not an error", async () => {
  console.error = () => {};
  pictures.set(`${STORAGE}/junk1.jpg`, { bytes: await junkJpeg(), type: "image/jpeg" });
  pictures.set(`${STORAGE}/junk2.jpg`, { bytes: await junkJpeg(), type: "image/jpeg" });
  const params = { ia: `${STORAGE}/junk1.jpg`, ib: `${STORAGE}/junk2.jpg` };
  assert.equal(await battleHeaderFor(params), "left=render-failed; right=render-failed");
  assert.ok((await draw({ ...BATTLE, ...params })).equals(await draw(BATTLE)), "the fallback is not the plain colour card");
});

test("an undecodable picture beside an empty side keeps that side's own reason", async () => {
  console.error = () => {};
  pictures.set(`${STORAGE}/junk.jpg`, { bytes: await junkJpeg(), type: "image/jpeg" });
  assert.equal(await battleHeaderFor({ ia: `${STORAGE}/junk.jpg` }), "left=render-failed; right=none");
  assert.equal(await battleHeaderFor({ ia: `${STORAGE}/junk.jpg`, ib: "https://evil.example.com/x.jpg" }), "left=render-failed; right=host-not-approved");
});

test("good pictures are untouched by the safety net: one attempt, both kept", async () => {
  pictures.set(`${STORAGE}/a.jpg`, { bytes: await picture("#e0a030", "jpeg"), type: "image/jpeg" });
  pictures.set(`${STORAGE}/b.png`, { bytes: await picture("#3050c0", "png"), type: "image/png" });
  assert.equal(await battleHeaderFor({ ia: `${STORAGE}/a.jpg`, ib: `${STORAGE}/b.png` }), "left=ok; right=ok");
});
