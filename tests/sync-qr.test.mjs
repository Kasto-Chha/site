// QR codes: the codes themselves, the PNG and the print-ready PDF. The images are not just
// checked for shape: they are scanned with a real QR reader and must contain the right address.

import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import jsQR from "jsqr";

const { generateCode, isValidCode, normalizeCode, qrUrlFor, isBot, cleanLabel, CODE_LENGTH, LABEL_MAX } = await import("../lib/sync/qr.js");
const { qrMatrix, qrSvg, qrPng, qrPdf } = await import("../lib/sync/qrImage.js");
const { PAGE_A5, textWidth, toWinAnsi, wrapText, fitLines, qrStandeePdf } = await import("../lib/sync/pdf.js");

const URL1 = "https://www.kastochhanepal.com/q/abc3k9xq";

// ---------- the codes ----------

test("a code is eight characters from an alphabet with nothing easy to misread", () => {
  assert.equal(CODE_LENGTH, 8);
  for (let i = 0; i < 2000; i += 1) {
    const code = generateCode();
    assert.match(code, /^[a-hj-km-np-z2-9]{8}$/, code);
    assert.ok(!/[01oli]/.test(code), `${code} has a character that is easy to misread`);
    assert.equal(isValidCode(code), true);
  }
});

test("codes do not repeat in practice", () => {
  const seen = new Set();
  for (let i = 0; i < 20000; i += 1) seen.add(generateCode());
  assert.ok(seen.size > 19990, `${seen.size} different codes in 20000`);
});

test("the generator can be driven, so a collision can be tested", () => {
  assert.equal(generateCode(() => 0), "aaaaaaaa");
  assert.equal(generateCode(() => 30), "99999999");
  assert.equal(generateCode((n) => n - 1).length, 8);
});

test("a code is valid by the database's own rule, in any case and with spaces around it", () => {
  for (const good of ["abc3k9xq", "ABC3K9XQ", "  abc3k9xq  ", "a1b2c3d4e5f6g7h8i9j0k1l2"]) assert.equal(isValidCode(good), true, good);
  for (const bad of ["", "abc", "abc3k9x", "abc-k9xq", "abc3k9xq/../", "x".repeat(25), "abc3k9\u00e9q", "../etc/passwd", null, undefined, 12345678]) {
    assert.equal(isValidCode(bad), false, String(bad));
  }
  assert.equal(normalizeCode("  ABC3k9XQ "), "abc3k9xq");
  for (const notText of [undefined, null, 12345678, {}, ["abc3k9xq"]]) assert.equal(normalizeCode(notText), "", String(notText));
});

test("a QR code points at the site's own address, without doubled slashes", () => {
  assert.equal(qrUrlFor("https://www.kastochhanepal.com", "abc3k9xq"), URL1);
  assert.equal(qrUrlFor("https://www.kastochhanepal.com/", "abc3k9xq"), URL1);
  assert.equal(qrUrlFor("https://www.kastochhanepal.com///", "abc3k9xq"), URL1);
  assert.equal(qrUrlFor("", "abc3k9xq"), "/q/abc3k9xq");
});

test("machines are told from people by their user agent", () => {
  for (const bot of ["Googlebot/2.1 (+http://www.google.com/bot.html)", "facebookexternalhit/1.1", "WhatsApp/2.23.20.0", "Slackbot-LinkExpanding 1.0", "curl/8.4.0", "python-requests/2.31", "Mozilla/5.0 (compatible; bingbot/2.0)", "Twitterbot/1.0", "HeadlessChrome/120", "TelegramBot (like TwitterBot)", "", undefined, null]) {
    assert.equal(isBot(bot), true, String(bot));
  }
  for (const person of ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"]) {
    assert.equal(isBot(person), false, person);
  }
});

test("a label is tidied and limited", () => {
  assert.equal(cleanLabel("  Table \t 4 \n"), "Table 4");
  assert.equal(cleanLabel("\u0000Window\u0007"), "Window");
  assert.equal(cleanLabel(undefined), "");
  assert.equal(cleanLabel("x".repeat(100)).length, LABEL_MAX + 1, "kept one over, so the caller can tell it was too long");
});

// ---------- the PNG ----------

async function scan(pngBytes) {
  const { data, info } = await sharp(pngBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return { text: result ? result.data : null, width: info.width, height: info.height };
}

test("the PNG scans, and contains exactly the address", async () => {
  const out = await scan(await qrPng(URL1));
  assert.equal(out.text, URL1);
});

test("addresses of many lengths all scan", async () => {
  for (const url of [
    "https://a.co/q/abc3k9xq",
    "https://www.kastochhanepal.com/q/zzzzzzzz",
    "https://www.kastochhanepal.com/q/2222222222222222222222",
    "https://kasto-chha-git-sync-stage-a-team.vercel.app/q/abc3k9xq",
    "http://localhost:3000/q/abc3k9xq"
  ]) {
    assert.equal((await scan(await qrPng(url))).text, url, url);
  }
});

test("the PNG is big enough to print, square, and each square is a whole number of pixels", async () => {
  const png = await qrPng(URL1);
  const { width, height } = await scan(png);
  assert.equal(width, height);
  assert.ok(width >= 1000, `${width}px`);
  const matrix = qrMatrix(URL1);
  assert.equal(width % (matrix.size + 8), 0, "a fractional pixel per square would blur the edges");
  const smaller = await qrPng(URL1, { minPx: 300 });
  assert.ok((await scan(smaller)).width >= 300);
  assert.equal((await scan(smaller)).text, URL1);
});

test("the PNG has the quiet zone a scanner needs, and is only black and white", async () => {
  const { data, info } = await sharp(await qrPng(URL1)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => data[(y * info.width + x) * 4];
  const scale = info.width / (qrMatrix(URL1).size + 8);
  for (let y = 0; y < scale * 4; y += 7) for (let x = 0; x < info.width; x += 11) assert.equal(px(x, y), 255, "the top margin is white");
  const seen = new Set();
  for (let i = 0; i < data.length; i += 4 * 97) seen.add(data[i]);
  assert.deepEqual([...seen].sort((a, b) => a - b), [0, 255], "no grey: nothing is blurred");
});

test("a code with some of its squares damaged still scans (error correction)", async () => {
  const matrix = qrMatrix(URL1);
  const flipped = new Set();
  for (let r = 12; r <= 15; r += 1) for (let c = 12; c <= 13; c += 1) flipped.add(r * matrix.size + c);
  const damaged = { size: matrix.size, get: (r, c) => (flipped.has(r * matrix.size + c) ? !matrix.get(r, c) : matrix.get(r, c)) };
  const png = await sharp(Buffer.from(qrSvg(damaged, 20))).png().toBuffer();
  assert.equal((await scan(png)).text, URL1, "8 damaged squares of a printed card are survivable");
});

test("the squares are those of the address, and different addresses differ", () => {
  const a = qrMatrix(URL1);
  const b = qrMatrix(URL1.replace("abc3k9xq", "abc3k9xr"));
  assert.equal(a.size, b.size);
  let differ = 0;
  for (let r = 0; r < a.size; r += 1) for (let c = 0; c < a.size; c += 1) if (a.get(r, c) !== b.get(r, c)) differ += 1;
  assert.ok(differ > 10);
  assert.equal(qrMatrix(URL1).get(0, 0), true, "the finder pattern's corner is dark");
  assert.equal(typeof a.get(3, 3), "boolean");
});

// ---------- the PDF's text ----------

test("text is measured with the standard Helvetica metrics", () => {
  assert.equal(Math.round(textWidth("Hello", false, 12) * 1000) / 1000, 27.336, "H722 e556 l222 l222 o556 at 12pt");
  assert.equal(textWidth("", false, 12), 0);
  assert.ok(textWidth("Hello", true, 12) > textWidth("Hello", false, 12), "bold is wider");
  assert.equal(textWidth("W", false, 1000), 944);
  assert.equal(textWidth("i", false, 1000), 222);
  assert.equal(textWidth("\u0915", false, 1000), 556, "a character outside the table is an average one");
});

test("text the standard fonts can draw is encoded, and escaped, and anything else is refused", () => {
  assert.equal(toWinAnsi("Caf\u00e9 Mitra").ok, true);
  assert.deepEqual([...toWinAnsi("Caf\u00e9").bytes], [67, 97, 102, 0xe9]);
  assert.deepEqual([...toWinAnsi("a(b)c\\d").bytes], [97, 0x5c, 40, 98, 0x5c, 41, 99, 0x5c, 0x5c, 100]);
  assert.deepEqual([...toWinAnsi("\u2019").bytes], [0x92], "a curly apostrophe is in Windows' encoding");
  assert.equal(toWinAnsi("\u0939\u093f\u092e\u093e\u0932").ok, false, "Devanagari cannot be drawn with Helvetica");
  assert.equal(toWinAnsi("Himal \u0939").ok, false);
  assert.equal(toWinAnsi("\ud83d\ude00").ok, false);
  assert.equal(toWinAnsi("").ok, true);
});

test("text wraps by measured width, and shrinks, and in the end is shortened rather than overflowing", () => {
  assert.deepEqual(wrapText("Himal Brew House, Jhamsikhel", true, 28, 347), ["Himal Brew House,", "Jhamsikhel"]);
  assert.deepEqual(wrapText("Short", true, 28, 347), ["Short"]);
  assert.deepEqual(wrapText("   ", true, 28, 347), []);
  const fit = fitLines("Himal Brew House, Jhamsikhel", { bold: true, maxSize: 28, minSize: 16, maxWidth: 347, maxLines: 2 });
  assert.equal(fit.size, 28);
  assert.equal(fit.lines.length, 2);
  const long = fitLines("A Very Long Business Name That Goes On And On And On, Lalitpur Metropolitan City", { bold: true, maxSize: 28, minSize: 16, maxWidth: 347, maxLines: 2 });
  assert.ok(long.size < 28 && long.size >= 16);
  assert.ok(long.lines.every((l) => textWidth(l, true, long.size) <= 347), "every line fits");
  const absurd = fitLines("Supercalifragilisticexpialidocious ".repeat(12), { bold: true, maxSize: 28, minSize: 16, maxWidth: 347, maxLines: 2 });
  assert.equal(absurd.size, 16);
  assert.ok(absurd.lines.length <= 2);
  assert.ok(absurd.lines.every((l) => textWidth(l, true, 16) <= 347), "even an absurd name cannot overflow the page");
  assert.ok(absurd.lines[absurd.lines.length - 1].endsWith("..."));
});

// ---------- the PDF's structure ----------

function readPdf(bytes) {
  const text = bytes.toString("latin1");
  const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
  assert.equal(text.slice(startxref, startxref + 4), "xref", "startxref points at the cross-reference table");
  const section = text.slice(startxref);
  const count = Number(section.match(/^xref\n0 (\d+)\n/)[1]);
  const entries = [...section.matchAll(/^(\d{10}) (\d{5}) ([nf]) \n/gm)].map((m) => ({ offset: Number(m[1]), kind: m[3] }));
  assert.equal(entries.length, count);
  return { text, entries, count, startxref };
}

function pdfOf(extra = {}) {
  return qrStandeePdf({ matrix: qrMatrix(URL1), title: "Himal Brew House, Jhamsikhel", url: URL1, now: Date.UTC(2026, 10, 4, 6, 30, 0), ...extra });
}

test("the PDF is a well-formed file: header, cross-reference table and trailer all agree", () => {
  const bytes = pdfOf();
  const { text, entries, count } = readPdf(bytes);
  assert.ok(text.startsWith("%PDF-1.4\n"));
  assert.ok(text.endsWith("%%EOF\n"));
  assert.equal(entries[0].kind, "f");
  for (let i = 1; i < count; i += 1) {
    assert.equal(text.slice(entries[i].offset, entries[i].offset + `${i} 0 obj`.length), `${i} 0 obj`, `object ${i} is where the table says`);
  }
  assert.match(text, /trailer\n<< \/Size 8 \/Root 1 0 R \/Info 7 0 R >>/);
});

test("the stream's declared length is its real length", () => {
  const bytes = pdfOf();
  const text = bytes.toString("latin1");
  const declared = Number(text.match(/<< \/Length (\d+) >>\nstream\n/)[1]);
  const start = text.indexOf("stream\n", text.indexOf("<< /Length")) + "stream\n".length;
  const end = text.indexOf("\nendstream");
  assert.equal(end - start, declared);
});

test("it is one A5 page with the two standard fonts, and nothing is embedded", () => {
  const text = pdfOf().toString("latin1");
  assert.match(text, /\/MediaBox \[0 0 419\.53 595\.28\]/);
  assert.equal((text.match(/\/Type \/Page /g) || []).length, 1);
  assert.match(text, /\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);
  assert.match(text, /\/BaseFont \/Helvetica-Bold \/Encoding \/WinAnsiEncoding/);
  assert.ok(!/\/FontFile|\/Image|\/XObject/.test(text), "no font or image is embedded");
  assert.ok(pdfOf().length < 12000, `${pdfOf().length} bytes`);
  assert.equal(PAGE_A5.width, 419.53);
});

test("the same input gives the same file, and the date is the one given", () => {
  assert.ok(pdfOf().equals(pdfOf()));
  assert.match(pdfOf().toString("latin1"), /\/CreationDate \(D:20261104063000Z\)/);
  assert.ok(!pdfOf().equals(pdfOf({ title: "Another Cafe" })));
});

// ---------- the PDF's QR code scans ----------

// Draw the PDF's filled rectangles onto a bitmap (white page, black squares) and scan it:
// the printed code must be the right one, not just a code-shaped drawing.
function rasterise(bytes, px = 4) {
  const text = bytes.toString("latin1");
  const stream = text.slice(text.indexOf("stream\n") + 7, text.indexOf("\nendstream"));
  const W = Math.ceil(PAGE_A5.width * px), H = Math.ceil(PAGE_A5.height * px);
  const rgba = new Uint8ClampedArray(W * H * 4).fill(255);
  let rects = 0;
  for (const m of stream.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re\n/g)) {
    const [x, y, w, h] = [m[1], m[2], m[3], m[4]].map(Number);
    rects += 1;
    for (let yy = Math.round((PAGE_A5.height - y - h) * px); yy < Math.round((PAGE_A5.height - y) * px); yy += 1) {
      for (let xx = Math.round(x * px); xx < Math.round((x + w) * px); xx += 1) {
        const i = (yy * W + xx) * 4;
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
      }
    }
  }
  return { rgba, W, H, rects };
}

test("the PDF's drawn squares scan to exactly the address", () => {
  const { rgba, W, H, rects } = rasterise(pdfOf(), 4);
  assert.ok(rects > 100);
  assert.equal(jsQR(rgba, W, H)?.data, URL1);
});

test("it scans whatever the name, including one that cannot be printed", () => {
  for (const title of ["Himal Brew House, Jhamsikhel", "A", "", "\u0939\u093f\u092e\u093e\u0932 \u0915\u093e\u092b\u0947", "Caf\u00e9 (Mitra) \\ Bar", "Supercalifragilisticexpialidocious ".repeat(10)]) {
    const { rgba, W, H } = rasterise(pdfOf({ title }), 4);
    assert.equal(jsQR(rgba, W, H)?.data, URL1, JSON.stringify(title).slice(0, 40));
    readPdf(pdfOf({ title }));
  }
});

test("a name that cannot be drawn is left off, and the rest of the sheet stays", () => {
  const withName = pdfOf().toString("latin1");
  const devanagari = pdfOf({ title: "\u0939\u093f\u092e\u093e\u0932 \u0915\u093e\u092b\u0947" }).toString("latin1");
  assert.ok(withName.includes("(Himal Brew House,)") && withName.includes("(Jhamsikhel)"));
  assert.ok(!devanagari.includes("Jhamsikhel"));
  assert.ok(devanagari.includes("(Scan to share your experience)"), "the instruction stays");
  assert.ok(devanagari.includes("(www.kastochhanepal.com/q/abc3k9xq)"), "and so does the address in words");
  assert.ok(!devanagari.includes("/Title (\u0939"), "the file's title is plain too");
});

test("brackets and backslashes in a name cannot break the file", () => {
  const bytes = pdfOf({ title: "Tom's (Best) Bar \\ Grill" });
  const { text } = readPdf(bytes);
  assert.ok(text.includes("Tom's \\(Best\\) Bar \\\\ Grill") || text.includes("Tom's \\(Best\\)"), "escaped in the page");
  assert.ok(text.includes("/Title (Tom's  Best  Bar   Grill - QR code)"), "and removed from the title");
});

test("everything printed stays inside the page, with a margin", () => {
  const text = pdfOf({ title: "A Very Long Business Name That Goes On And On And On, Lalitpur Metropolitan City" }).toString("latin1");
  for (const m of text.matchAll(/BT \/F[12] ([\d.]+) Tf ([\d.]+) ([\d.]+) Td \(/g)) {
    const [, , x, y] = m.map(Number);
    assert.ok(x >= 20, `text starts at x=${x}`);
    assert.ok(y >= 20 && y <= PAGE_A5.height - 20, `text at y=${y}`);
  }
  const { rgba, W, H } = rasterise(pdfOf(), 2);
  for (let y = 0; y < H; y += 1) for (const x of [0, 1, W - 2, W - 1]) assert.equal(rgba[(y * W + x) * 4], 255, "the page edge is clear");
});

test("the PDF's squares are exactly the code's squares, in the right places: not a mirror, not shifted", () => {
  const matrix = qrMatrix(URL1);
  const text = pdfOf().toString("latin1");
  const stream = text.slice(text.indexOf("stream\n") + 7, text.indexOf("\nendstream"));
  const rects = [...stream.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re\n/g)].map((m) => m.slice(1).map(Number));
  const left = Math.min(...rects.map(([x]) => x));
  const top = Math.max(...rects.map(([, y, , h]) => y + h));
  const cell = 290 / matrix.size;
  assert.ok(Math.abs(left - (PAGE_A5.width - 290) / 2) < 0.1, "centred on the page");
  const drawn = Array.from({ length: matrix.size }, () => Array(matrix.size).fill(false));
  for (const [x, y, w, h] of rects) {
    const row = Math.round((top - (y + h)) / cell);
    const col = Math.round((x - left) / cell);
    assert.ok(Math.abs(h - cell) < 0.02, "a row high");
    for (let i = 0; i < Math.round(w / cell); i += 1) drawn[row][col + i] = true;
  }
  for (let r = 0; r < matrix.size; r += 1) for (let c = 0; c < matrix.size; c += 1) assert.equal(drawn[r][c], matrix.get(r, c), `square ${r},${c}`);
});
