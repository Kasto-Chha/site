import QRCode from "qrcode";
import sharp from "sharp";

import { qrStandeePdf } from "./pdf";

// Making the QR code itself: the dark and light squares, a PNG of them, and the print-ready
// sheet. Server-only (it uses sharp). The squares come from the `qrcode` library; the PNG and
// the PDF are drawn here, so no font is needed to make either.

// The squares for a text, at error correction M (about 15% of the code can be damaged or
// covered and it still scans, which suits a printed table card).
export function qrMatrix(text) {
  const qr = QRCode.create(String(text), { errorCorrectionLevel: "M" });
  return { size: qr.modules.size, get: (row, col) => qr.modules.get(row, col) === 1 || qr.modules.get(row, col) === true };
}

// An SVG of the code on white, with the 4-square quiet zone around it that scanners need.
// Each module is a whole number of pixels, so it is sharp, never blurred.
export function qrSvg(matrix, scale) {
  const quiet = 4;
  const total = matrix.size + quiet * 2;
  let path = "";
  for (let row = 0; row < matrix.size; row += 1) {
    let col = 0;
    while (col < matrix.size) {
      if (!matrix.get(row, col)) {
        col += 1;
        continue;
      }
      let end = col;
      while (end + 1 < matrix.size && matrix.get(row, end + 1)) end += 1;
      path += `M${col + quiet} ${row + quiet}h${end - col + 1}v1h-${end - col + 1}z`;
      col = end + 1;
    }
  }
  const px = total * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

// A PNG at least `minPx` wide, a whole number of pixels per square.
export async function qrPng(text, { minPx = 1000 } = {}) {
  const matrix = qrMatrix(text);
  const scale = Math.max(4, Math.ceil(minPx / (matrix.size + 8)));
  return sharp(Buffer.from(qrSvg(matrix, scale))).png({ compressionLevel: 9 }).toBuffer();
}

// The print-ready A5 sheet: name, QR code, what to do, the address in words.
export function qrPdf(text, { title, now } = {}) {
  return qrStandeePdf({ matrix: qrMatrix(text), title, url: text, now });
}
