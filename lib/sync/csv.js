import { NEPAL_OFFSET_MS, nepalDay } from "./time";

// Writing a CSV that opens correctly and safely in Excel and Google Sheets. Pure.
//
//   - A cell that BEGINS with = + - @ (or a tab or carriage return) is read by a spreadsheet as a formula, and a
//     name someone typed into a form must never run as one. Such a cell is given a leading apostrophe, which is
//     what OWASP recommends. Only text is touched: a number is written as a number.
//   - A cell with a comma, a quote or a line break is quoted, and its quotes doubled.
//   - Rows end with CRLF, as the format says. The download starts with a byte-order mark, so Excel reads the
//     file as UTF-8 and Nepali names do not turn into question marks.
export const CSV_BOM = "\uFEFF";

export function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  let text = String(value);
  if (/^[\t\r]/.test(text) || /^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Every row must have exactly as many cells as there are headings: a ragged file is a bug, never a quiet one.
export function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    if (row.length !== headers.length) throw new Error(`CSV row has ${row.length} cells, expected ${headers.length}`);
    lines.push(row.map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

// "kastochha-sync-activity-30d-2026-11-05.csv": the day is the Nepal day, which is the day the team is living in.
export function exportFilename(kind, suffix, now = Date.now()) {
  return `kastochha-sync-${kind}${suffix ? `-${suffix}` : ""}-${nepalDay(now)}.csv`;
}

// "2026-11-04" and "2026-11-04 17:45", both in Nepal time. Empty for no date.
export function nepalDate(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : nepalDay(t);
}
export function nepalDateTime(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t + NEPAL_OFFSET_MS).toISOString().replace("T", " ").slice(0, 16);
}
