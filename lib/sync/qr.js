import crypto from "node:crypto";

import { fetchAll } from "./paging";

// QR codes and hub events. Server-only: it uses the service role and node:crypto.
//
// A QR code is a short public code (printed on a table) that opens a business's hub. The
// code is not a secret: anyone who can see the table can read it. It only has to be
// unguessable enough that nobody can enumerate other businesses' codes, and short enough
// that the QR stays simple to scan.

// No 0, o, 1, l or i, so a code read aloud or typed from a sticker is not misread.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const CODE_LENGTH = 8;
export const MAX_CODES_PER_BUSINESS = 30;
export const LABEL_MAX = 60;

// Every kind of event the database accepts (migrations 0018 and 0022). A visitor's browser may
// report only PUBLIC_EVENTS; later patches add the rest.
export const HUB_CLICK_EVENTS = ["hub_share", "hub_google", "hub_maps"];
// What the badge on a business's own website reports: the popup opened, and a click on each link.
export const BADGE_EVENTS = ["badge_open", "badge_share", "badge_ask"];
export const EVENT_TYPES = ["scan", "hub_share", "hub_google", "hub_ask", "hub_note", "hub_maps", "post_created", "google_copy", ...BADGE_EVENTS];
// The events a visitor's browser may report to /api/sync/event: the hub's taps and the badge's.
// A scan, a post and the rest are only ever recorded by the server itself.
export const PUBLIC_EVENTS = [...HUB_CLICK_EVENTS, ...BADGE_EVENTS];

// The cookie that stops a reload, or a second scan a minute later, from counting twice.
export const SCAN_COOKIE = "kc_q";
export const SCAN_COOKIE_SECONDS = 600;

export function generateCode(randomInt = crypto.randomInt) {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

// Only text is a code: a number, an object or nothing is never one, however it would print.
export function normalizeCode(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// The same rule as the database's check, so a malformed code never reaches a query.
export function isValidCode(value) {
  return /^[a-z0-9]{8,24}$/.test(normalizeCode(value));
}

// Where a QR code points. The site's own address, so a code printed from a preview
// deployment would say so in the admin before it was printed.
export function qrUrlFor(siteUrl, code) {
  return `${(siteUrl || "").toString().replace(/\/+$/, "")}/q/${code}`;
}

// Link previews, crawlers and scripts open links without a person behind them. They must not
// inflate a business's scan count.
export function isBot(userAgent) {
  const ua = (userAgent ?? "").toString();
  if (!ua) return true;
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|skype|curl|wget|python-requests|httpclient|headless|lighthouse/i.test(ua);
}

export function cleanLabel(value) {
  return (value ?? "").toString().replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LABEL_MAX + 1);
}

// A code, with its business, however the code's own state. Callers decide what to do with
// a code that is switched off or a business whose tag was removed. null when the code does
// not exist or the database could not be read.
export async function findQrByCode(supabase, rawCode) {
  const code = normalizeCode(rawCode);
  if (!isValidCode(code)) return null;
  try {
    const qr = await supabase.from("sync_qr_codes").select("id, merchant_id, code, label, active").eq("code", code).maybeSingle();
    if (qr.error || !qr.data) return qr.error ? (console.error("QR lookup failed:", qr.error.message), null) : null;
    const merchant = await supabase.from("sync_merchants").select("id, slug, topic_slug, status").eq("id", qr.data.merchant_id).maybeSingle();
    if (merchant.error || !merchant.data) return null;
    return { qr: qr.data, merchant: merchant.data };
  } catch (error) {
    console.error("QR lookup unavailable:", error?.message || error);
    return null;
  }
}

// One event. Never throws and never waits on anything a visitor needs: a customer scanning a
// code must reach the hub even if the count could not be written.
export async function logHubEvent(supabase, { merchantId, qrCodeId = null, type }) {
  if (!merchantId || !EVENT_TYPES.includes(type)) return false;
  try {
    const { error } = await supabase.from("sync_events").insert({ merchant_id: merchantId, qr_code_id: qrCodeId || null, event_type: type });
    if (error) {
      console.error("Hub event not recorded:", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Hub event unavailable:", error?.message || error);
    return false;
  }
}

// A new code for a business, retrying if the random code is already taken (the database's
// unique rule decides that, so two admins at once cannot both get it).
export async function createQrCode(supabase, { merchantId, label, id = crypto.randomUUID(), attempts = 6, generate = generateCode }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const row = { id, merchant_id: merchantId, code: generate(), label, active: true };
    const { data, error } = await supabase.from("sync_qr_codes").insert(row).select().single();
    if (!error) return data;
    if (error.code !== "23505") throw new Error(error.message);
  }
  throw new Error("Could not find an unused code. Try again.");
}

// A business's codes with how many times each was scanned (all time, and the last 7 days).
export async function listQrCodes(supabase, merchantId, { now = Date.now() } = {}) {
  const codes = await supabase.from("sync_qr_codes").select("id, merchant_id, code, label, active, created_at").eq("merchant_id", merchantId).order("created_at", { ascending: true });
  if (codes.error) throw new Error(codes.error.message);
  // Paged: one request would stop at the server's 1,000-row cap and under-count without a word.
  const events = await fetchAll(() =>
    supabase.from("sync_events").select("qr_code_id, created_at").eq("merchant_id", merchantId).eq("event_type", "scan").order("created_at", { ascending: true }).order("id", { ascending: true })
  );
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const total = new Map();
  const recent = new Map();
  for (const event of events.rows) {
    if (!event.qr_code_id) continue;
    total.set(event.qr_code_id, (total.get(event.qr_code_id) || 0) + 1);
    if (new Date(event.created_at).getTime() >= weekAgo) recent.set(event.qr_code_id, (recent.get(event.qr_code_id) || 0) + 1);
  }
  return (codes.data || []).map((c) => ({ ...c, scans: total.get(c.id) || 0, scans7: recent.get(c.id) || 0 }));
}
