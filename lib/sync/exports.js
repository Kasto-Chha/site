import { kindDisplay } from "./businessTypes";
import { nepalDate, nepalDateTime, toCsv } from "./csv";
import { RANGE_LABELS, loadOverview, parseRange, rangeStart } from "./overview";
import { fetchAll } from "./paging";
import { replyCountsByMerchant } from "./ownerReplies";

// The files the team can download. Three, each a plain table a spreadsheet can sort and sum:
//   businesses  every business that was ever tagged, and what is set up for it
//   qr-codes    every QR card, with how many times it has been scanned
//   activity    one row per active business for a range: what happened (the Overview's own numbers)
//
// Private notes are in none of them, on purpose: they are private and carry people's contact details. They are
// read in the inbox. Nothing here contains an account id, an email, or a person's words.
//
// A file is complete or it is not made. A read that fails, or more data than can be read in one go, is an error
// the team sees: never a file that looks whole and is missing rows.
export const EXPORT_KINDS = ["businesses", "qr-codes", "activity"];

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://www.kastochhanepal.com").replace(/\/+$/, "");

function tooMuch() {
  return Object.assign(new Error("There is too much data to export in one file. Choose a shorter range."), { expected: true });
}
function read(result) {
  if (result.truncated) throw tooMuch();
  return result.rows;
}

async function businesses(supabase) {
  const merchants = read(await fetchAll(() => supabase.from("sync_merchants").select("id, slug, topic_slug, business_name, area, business_kind, kind_label, status, created_at, google_review_url, google_maps_url, owner_user_id").order("created_at", { ascending: true })));
  const codes = read(await fetchAll(() => supabase.from("sync_qr_codes").select("id, merchant_id, active").order("created_at", { ascending: true })));
  const active = new Map();
  const total = new Map();
  for (const c of codes) {
    total.set(c.merchant_id, (total.get(c.merchant_id) || 0) + 1);
    if (c.active) active.set(c.merchant_id, (active.get(c.merchant_id) || 0) + 1);
  }
  const site = siteUrl();
  return {
    kind: "businesses",
    suffix: "",
    text: toCsv(
      ["Business", "Area", "Type", "Status", "Hub address", "Business page address", "QR cards", "QR cards switched on", "Google review link", "Google Maps link", "Owner linked", "Tagged on"],
      merchants.map((m) => [
        m.business_name, m.area, kindDisplay(m.business_kind, m.kind_label), m.status,
        `${site}/hub/${m.slug}`, `${site}/discussions/${m.topic_slug}`,
        total.get(m.id) || 0, active.get(m.id) || 0,
        Boolean(m.google_review_url), Boolean(m.google_maps_url),
        Boolean(m.owner_user_id), nepalDate(m.created_at)
      ])
    )
  };
}

async function qrCodes(supabase) {
  const codes = read(await fetchAll(() => supabase.from("sync_qr_codes").select("id, merchant_id, code, label, active, created_at").order("created_at", { ascending: true })));
  const merchants = read(await fetchAll(() => supabase.from("sync_merchants").select("id, business_name, status").order("created_at", { ascending: true })));
  const scans = read(await fetchAll(() => supabase.from("sync_events").select("qr_code_id, created_at").eq("event_type", "scan").order("created_at", { ascending: true })));
  const byMerchant = new Map(merchants.map((m) => [m.id, m]));
  const count = new Map();
  const last = new Map();
  for (const s of scans) {
    if (!s.qr_code_id) continue;
    count.set(s.qr_code_id, (count.get(s.qr_code_id) || 0) + 1);
    if (!last.get(s.qr_code_id) || s.created_at > last.get(s.qr_code_id)) last.set(s.qr_code_id, s.created_at);
  }
  const site = siteUrl();
  const rows = codes
    .map((c) => ({ c, m: byMerchant.get(c.merchant_id) }))
    .sort((a, b) => (a.m?.business_name || "").localeCompare(b.m?.business_name || "") || a.c.created_at.localeCompare(b.c.created_at));
  return {
    kind: "qr-codes",
    suffix: "",
    text: toCsv(
      ["Business", "Business status", "Card label", "Code", "Scan address", "Card switched on", "Scans (all time)", "Last scan (Nepal time)", "Made on"],
      rows.map(({ c, m }) => [m?.business_name ?? "", m?.status ?? "", c.label, c.code, `${site}/q/${c.code}`, Boolean(c.active), count.get(c.id) || 0, nepalDateTime(last.get(c.id)), nepalDate(c.created_at)])
    )
  };
}

async function activity(supabase, { range, now }) {
  const chosen = parseRange(range);
  const overview = await loadOverview(supabase, { range: chosen, now });
  if (overview.truncated) throw tooMuch();
  const since = rangeStart(chosen, now);
  const from = since === null ? null : new Date(since).toISOString();
  const countBy = async (table) => {
    const rows = read(await fetchAll(() => {
      let query = supabase.from(table).select("merchant_id, created_at").order("created_at", { ascending: true });
      if (from) query = query.gte("created_at", from);
      return query;
    }));
    const out = new Map();
    for (const r of rows) out.set(r.merchant_id, (out.get(r.merchant_id) || 0) + 1);
    return out;
  };
  const replies = await replyCountsByMerchant(supabase, from);
  const notes = await countBy("sync_feedback");
  const rows = [...overview.rows].sort((a, b) => a.name.localeCompare(b.name));
  return {
    kind: "activity",
    suffix: chosen,
    text: toCsv(
      ["Business", "Area", "Type", "QR cards switched on", "Range", "QR scans", "Hub taps", "Website badge opens", "Website badge clicks", "Experiences", "Questions", "Visited posts", "Business replies", "Private notes", "Last activity (Nepal time)", "Status"],
      rows.map((r) => [r.name, r.area, r.kindName, r.activeCodes, RANGE_LABELS[chosen], r.scans, r.taps, r.badgeOpens, r.badgeClicks, r.experiences, r.questions, r.visited, replies.get(r.id) || 0, notes.get(r.id) || 0, nepalDateTime(r.lastActivity), r.status.label])
    )
  };
}

export async function buildExport(supabase, kind, { range = "30d", now = Date.now() } = {}) {
  if (kind === "businesses") return businesses(supabase);
  if (kind === "qr-codes") return qrCodes(supabase);
  if (kind === "activity") return activity(supabase, { range, now });
  throw new Error("Unknown export");
}
