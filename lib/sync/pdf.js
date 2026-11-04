// A tiny PDF writer for one thing: a print-ready sheet with a business's name, its QR code
// and a line saying what to do. One A5 page, drawn with vectors and the standard Helvetica
// fonts, so it needs no library, embeds no font and stays a few kilobytes. Pure.
//
// The QR code is drawn as filled squares, not an image, so it stays sharp at any print size.
// A name the standard fonts cannot draw (Devanagari, say) is left off the sheet rather than
// printed as question marks: the QR code and the instruction are the point of the sheet.

export const PAGE_A5 = { width: 419.53, height: 595.28 };

// Widths of Helvetica and Helvetica-Bold, in 1/1000 of the font size, for characters 32 to
// 126 (the standard Adobe metrics). Other characters are measured as an average letter.
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
];
const AVERAGE = 556;

export function textWidth(text, bold, size) {
  const table = bold ? BOLD : REGULAR;
  let units = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    units += code >= 32 && code <= 126 ? table[code - 32] : AVERAGE;
  }
  return (units * size) / 1000;
}

// The few characters outside Latin-1 that Windows' own text encoding (which PDF's
// WinAnsiEncoding is) can draw, as their byte values.
const WIN_SPECIAL = { "\u20ac": 0x80, "\u2018": 0x91, "\u2019": 0x92, "\u201c": 0x93, "\u201d": 0x94, "\u2022": 0x95, "\u2013": 0x96, "\u2014": 0x97 };

// Text as WinAnsi bytes, with \ ( ) escaped, or { ok: false } if any character cannot be drawn.
export function toWinAnsi(text) {
  const out = [];
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    let byte;
    if (code >= 32 && code <= 126) byte = code;
    else if (code >= 160 && code <= 255) byte = code;
    else if (WIN_SPECIAL[ch] !== undefined) byte = WIN_SPECIAL[ch];
    else return { ok: false, bytes: Buffer.alloc(0) };
    if (byte === 0x5c || byte === 0x28 || byte === 0x29) out.push(0x5c);
    out.push(byte);
  }
  return { ok: true, bytes: Buffer.from(out) };
}

// Greedy line breaking by measured width.
export function wrapText(text, bold, size, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (!line || textWidth(trial, bold, size) <= maxWidth) line = trial;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// The largest size (down to minSize) at which the text fits in maxLines lines of maxWidth.
// If even the smallest does not fit, the last line is shortened with "..." so it always does.
export function fitLines(text, { bold, maxSize, minSize, maxWidth, maxLines }) {
  for (let size = maxSize; size >= minSize; size -= 1) {
    const lines = wrapText(text, bold, size, maxWidth);
    if (lines.length <= maxLines && lines.every((l) => textWidth(l, bold, size) <= maxWidth)) return { size, lines };
  }
  let lines = wrapText(text, bold, minSize, maxWidth).slice(0, maxLines);
  const last = lines.length - 1;
  while (last >= 0 && lines[last].length > 1 && textWidth(`${lines[last]}...`, bold, minSize) > maxWidth) lines[last] = lines[last].slice(0, -1);
  if (last >= 0) lines[last] = `${lines[last]}...`;
  return { size: minSize, lines };
}

const num = (n) => (Math.round(n * 100) / 100).toString();

// One piece of text, centred on the page.
function centred(page, bytes, bold, size, y, width) {
  const x = (page.width - width) / 2;
  return Buffer.concat([Buffer.from(`BT /${bold ? "F2" : "F1"} ${num(size)} Tf ${num(x)} ${num(y)} Td (`), bytes, Buffer.from(") Tj ET\n")]);
}

function pdfDate(now) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, "0");
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

// Joins the objects into a file with a correct cross-reference table.
function assemble(objects, { root, info }) {
  const parts = [Buffer.from("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n", "latin1")];
  const offsets = [];
  let length = parts[0].length;
  objects.forEach((body, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from("\nendobj\n")]);
    parts.push(chunk);
    length += chunk.length;
  });
  const xrefAt = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${root} 0 R /Info ${info} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  parts.push(Buffer.from(xref));
  return Buffer.concat(parts);
}

// The sheet. `matrix` is { size, get(row, col) } for the QR code; `title` is the business's
// name; `url` is what the code opens, printed small underneath in case the scan fails.
export function qrStandeePdf({ matrix, title, url, now = Date.now() }) {
  const page = PAGE_A5;
  const margin = 36;
  const inner = page.width - margin * 2;
  const content = [];

  // The name, at the top: as large as fits in two lines, or left off if it cannot be drawn.
  const nameOk = toWinAnsi(title || "").ok && String(title || "").trim().length > 0;
  let cursor = page.height - 64;
  if (nameOk) {
    const fit = fitLines(String(title).trim(), { bold: true, maxSize: 28, minSize: 16, maxWidth: inner, maxLines: 2 });
    for (const line of fit.lines) {
      content.push(centred(page, toWinAnsi(line).bytes, true, fit.size, cursor, textWidth(line, true, fit.size)));
      cursor -= fit.size * 1.2;
    }
  }

  // The QR code, centred, as filled squares. Horizontal runs of dark modules are joined into
  // one rectangle each, which keeps the file small and leaves no seams.
  const side = 290;
  const cell = side / matrix.size;
  const left = (page.width - side) / 2;
  const top = Math.min(cursor - 24, page.height - 150);
  content.push(Buffer.from("0 g\n"));
  for (let row = 0; row < matrix.size; row += 1) {
    let col = 0;
    while (col < matrix.size) {
      if (!matrix.get(row, col)) {
        col += 1;
        continue;
      }
      let end = col;
      while (end + 1 < matrix.size && matrix.get(row, end + 1)) end += 1;
      content.push(Buffer.from(`${num(left + col * cell)} ${num(top - (row + 1) * cell)} ${num((end - col + 1) * cell)} ${num(cell)} re\n`));
      col = end + 1;
    }
  }
  content.push(Buffer.from("f\n"));

  // What to do, and the address in words.
  let y = top - side - 36;
  const cta = "Scan to share your experience";
  const ctaSize = 20;
  content.push(centred(page, toWinAnsi(cta).bytes, true, ctaSize, y, textWidth(cta, true, ctaSize)));
  y -= 22;
  const shown = String(url || "").replace(/^https?:\/\//, "");
  if (toWinAnsi(shown).ok && shown) {
    content.push(centred(page, toWinAnsi(shown).bytes, false, 11, y, textWidth(shown, false, 11)));
    y -= 18;
  }
  const foot = "KastoChha Sync";
  content.push(centred(page, toWinAnsi(foot).bytes, false, 9, 30, textWidth(foot, false, 9)));

  const stream = Buffer.concat(content);
  const safeTitle = toWinAnsi(title || "").ok ? String(title).replace(/[()\\]/g, " ").slice(0, 120) : "";
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
    Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from("\nendstream")]),
    Buffer.from(`<< /Title (${safeTitle ? `${safeTitle} - QR code` : "QR code"}) /Producer (KastoChha Sync) /CreationDate (${pdfDate(now)}) >>`)
  ];
  return assemble(objects, { root: 1, info: 7 });
}
