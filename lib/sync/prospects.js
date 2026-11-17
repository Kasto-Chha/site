import { BUSINESS_KINDS, cleanLine, googleLink } from "./validate";
import { OTHER_KIND } from "./businessTypes";
import { threadSlugFor } from "./slug";
import { cleanDrafts, cleanFacts, knownCount, NAME_MAX } from "./audit";
import { isIsoDate } from "./stage";

// Prospects (patch 14d): businesses we are pitching, kept apart from the businesses on KastoChha until the owner says yes.
// The rules for them come first (pure), then the database calls.

export const AREA_MAX = 80;
export const KIND_LABEL_MAX = 60;

export const STATUSES = ["new", "typed", "report_ready", "sent", "replied", "declined", "tagged"];
export const STATUS_LABELS = { new: "New", typed: "Facts typed in", report_ready: "Report ready", sent: "Sent", replied: "Replied", declined: "Said no", tagged: "Tagged" };
// The list's chips. "New" holds both a prospect with nothing typed and one with facts typed but no report yet.
export const FILTERS = ["all", "new", "report_ready", "sent", "replied", "closed"];
export const FILTER_LABELS = { all: "All", new: "New", report_ready: "Report ready", sent: "Sent", replied: "Replied", closed: "Closed" };
export const FILTER_STATUSES = { new: ["new", "typed"], report_ready: ["report_ready"], sent: ["sent"], replied: ["replied"], closed: ["declined", "tagged"] };
export const SEND_WAYS = ["email", "whatsapp", "in_person"];
export const SEND_LABELS = { email: "Email", whatsapp: "WhatsApp", in_person: "In person" };

// While a report has not gone out, the facts and drafts can still change. Once it has, they are locked: a report an owner has
// already read must not change behind them.
export const EDITABLE = ["new", "typed", "report_ready"];

export const isEditable = (status) => EDITABLE.includes(status);

// The key that tells two prospects (or a prospect and a business) are the same place: the thread address "Name, Area" makes.
export const matchKey = (name, area) => threadSlugFor({ name, area });

// ---------- a new prospect, and its details ----------

function details(input, { partial }) {
  const values = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  if (!partial || has("businessName")) {
    const name = cleanLine(input.businessName, NAME_MAX);
    if (!name) return { error: "Give the business's name." };
    if (name.length > NAME_MAX) return { error: `The name can be at most ${NAME_MAX} characters.` };
    values.business_name = name;
  }
  if (!partial || has("area")) {
    const area = cleanLine(input.area, AREA_MAX);
    if (!area) return { error: "Give the area." };
    if (area.length > AREA_MAX) return { error: `The area can be at most ${AREA_MAX} characters.` };
    values.area = area;
  }
  if (!partial || has("businessKind")) {
    const kind = (input.businessKind ?? "").toString();
    if (!BUSINESS_KINDS.includes(kind)) return { error: "Choose the type of business from the list." };
    values.business_kind = kind;
    if (kind !== OTHER_KIND) values.kind_label = null;
  }
  if (has("kindLabel") || (values.business_kind === OTHER_KIND && !partial)) {
    const label = cleanLine(input.kindLabel, KIND_LABEL_MAX);
    if (label.length > KIND_LABEL_MAX) return { error: `What the business is can be at most ${KIND_LABEL_MAX} characters.` };
    if ((values.business_kind ?? input.businessKind) === OTHER_KIND) values.kind_label = label || null;
  }
  if (!partial || has("googleMapsUrl")) {
    const link = googleLink(input.googleMapsUrl);
    if (link === null) return { error: "That is not a Google Maps or Google Business link." };
    values.google_maps_url = link || null;
  }
  return { values };
}

export function validateNewProspect(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "The details were not understood." };
  const base = details(input, { partial: false });
  if (base.error) return base;
  const key = matchKey(base.values.business_name, base.values.area);
  if (!key) return { error: "That name and area do not make a usable address." };
  return { values: { ...base.values, match_key: key, status: "new" } };
}

// ---------- the moves ----------

// Works out what an action changes, or why it is refused. `row` is the prospect as it is now.
export function planProspect(row, input, today) {
  if (!row) return { ok: false, status: 404, error: "Prospect not found." };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, status: 400, error: "The request was not understood." };
  const at = new Date().toISOString();
  switch (input.action) {
    case "details": {
      if (!isEditable(row.status)) return { ok: false, status: 409, error: "A report has gone out for this prospect, so its details are locked." };
      const result = details(input, { partial: true });
      if (result.error) return { ok: false, status: 400, error: result.error };
      const values = { ...result.values };
      if (values.business_name !== undefined || values.area !== undefined) values.match_key = matchKey(values.business_name ?? row.business_name, values.area ?? row.area);
      return { ok: true, action: "details", values };
    }
    case "facts": {
      if (!isEditable(row.status)) return { ok: false, status: 409, error: "A report has gone out for this prospect, so its facts are locked." };
      const facts = cleanFacts(input.facts);
      if (facts.error) return { ok: false, status: 400, error: facts.error };
      const drafts = cleanDrafts(input.drafts);
      if (drafts.error) return { ok: false, status: 400, error: drafts.error };
      const typed = knownCount(facts.facts) > 0;
      // Both boxes are for this version of the facts and drafts. Any change to them is a new check.
      const same = JSON.stringify(facts.facts) === JSON.stringify(row.facts || {}) && JSON.stringify(drafts.drafts) === JSON.stringify(row.drafts || {});
      const keepTicks = same && row.status === "report_ready";
      return {
        ok: true,
        action: "facts",
        values: {
          facts: facts.facts,
          drafts: drafts.drafts,
          facts_checked: keepTicks ? row.facts_checked : false,
          drafts_checked: keepTicks ? row.drafts_checked : false,
          status: keepTicks ? "report_ready" : typed ? "typed" : "new"
        }
      };
    }
    case "make_report": {
      if (!["typed", "report_ready"].includes(row.status)) return { ok: false, status: 409, error: row.status === "new" ? "Type in the facts first." : "A report has already gone out for this prospect." };
      if (knownCount(row.facts) === 0) return { ok: false, status: 409, error: "Type in the facts first." };
      if (input.factsChecked !== true || input.draftsChecked !== true) return { ok: false, status: 400, error: "Tick both boxes first: you checked the facts, and you read the drafts." };
      return { ok: true, action: "make_report", values: { facts_checked: true, drafts_checked: true, status: "report_ready" } };
    }
    case "sent": {
      if (!["report_ready", "sent"].includes(row.status)) return { ok: false, status: 409, error: "Make the report before recording that it was sent." };
      if (!SEND_WAYS.includes(input.via)) return { ok: false, status: 400, error: "Say how you sent it: email, WhatsApp or in person." };
      if (!isIsoDate(input.sentOn)) return { ok: false, status: 400, error: "Give the date you sent it." };
      if (input.sentOn > today) return { ok: false, status: 400, error: "The date you sent it cannot be in the future." };
      let followUp = null;
      if (input.followUpOn !== undefined && input.followUpOn !== null && input.followUpOn !== "") {
        if (!isIsoDate(input.followUpOn)) return { ok: false, status: 400, error: "Give the follow-up as a date." };
        if (input.followUpOn < input.sentOn) return { ok: false, status: 400, error: "The follow-up cannot be before the day you sent it." };
        followUp = input.followUpOn;
      }
      return { ok: true, action: "sent", values: { status: "sent", sent_via: input.via, sent_on: input.sentOn, follow_up_on: followUp } };
    }
    case "replied":
      if (row.status !== "sent") return { ok: false, status: 409, error: "Only a report that was sent can be marked as replied." };
      return { ok: true, action: "replied", values: { status: "replied", follow_up_on: null } };
    case "declined":
      if (!["report_ready", "sent", "replied"].includes(row.status)) return { ok: false, status: 409, error: "Make the report first." };
      return { ok: true, action: "declined", values: { status: "declined", follow_up_on: null } };
    default:
      return { ok: false, status: 400, error: "Unknown action." };
  }
}

// ---------- the list ----------

export function parseListQuery(searchParams) {
  const params = searchParams && typeof searchParams === "object" ? searchParams : {};
  const one = (value) => (Array.isArray(value) ? value[0] : value);
  const raw = String(one(params.status) ?? "").toLowerCase();
  const q = String(one(params.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return { status: FILTERS.includes(raw) ? raw : "all", q };
}

export function filterProspects(prospects, { status = "all", q = "" } = {}) {
  const needle = q.toLowerCase();
  return (prospects || []).filter((p) => {
    if (status !== "all" && !FILTER_STATUSES[status].includes(p.status)) return false;
    return !needle || [p.business_name, p.area].some((field) => String(field ?? "").toLowerCase().includes(needle));
  });
}

export function filterCounts(prospects, q = "") {
  const counts = Object.fromEntries(FILTERS.map((key) => [key, 0]));
  for (const p of filterProspects(prospects, { status: "all", q })) {
    counts.all += 1;
    for (const key of FILTERS) if (key !== "all" && FILTER_STATUSES[key].includes(p.status)) counts[key] += 1;
  }
  return counts;
}

export function listHref(status, q) {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (q) params.set("q", q);
  const text = params.toString();
  return `/admin/sync/audit${text ? `?${text}` : ""}`;
}

// What the list says to do next for a prospect.
export function nextStep(p) {
  switch (p.status) {
    case "new": return "Type in the facts";
    case "typed": return "Check it and make the report";
    case "report_ready": return "Send the report";
    case "sent": return p.follow_up_on ? `Follow up ${p.follow_up_on}` : "No reply yet";
    case "replied": return "Tag as business";
    case "declined": return "Said no";
    case "tagged": return "On KastoChha";
    default: return "";
  }
}

// ---------- the database ----------

export const COLUMNS = "id, business_name, area, business_kind, kind_label, google_maps_url, match_key, facts, drafts, facts_checked, drafts_checked, status, sent_via, sent_on, follow_up_on, merchant_id, created_by, created_at, updated_at";
const fail = (message, error) => Object.assign(new Error(message), { code: error?.code });

export async function listProspects(supabase) {
  const { data, error } = await supabase.from("sync_prospects").select(COLUMNS).order("created_at", { ascending: false }).limit(1000);
  if (error) throw fail("The prospects could not be read.", error);
  return data || [];
}

export async function getProspect(supabase, id) {
  const { data, error } = await supabase.from("sync_prospects").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw fail("The prospect could not be read.", error);
  return data || null;
}

// The prospect already on the list for the same place, or a business already on KastoChha. Either means: do not pitch it twice.
export async function findSamePlace(supabase, key, exceptId = null) {
  let prospects = supabase.from("sync_prospects").select("id, business_name, status").eq("match_key", key).limit(1);
  if (exceptId) prospects = prospects.neq("id", exceptId);
  const found = await prospects;
  if (found.error) throw fail("The prospects could not be checked.", found.error);
  if (found.data && found.data.length) return { kind: "prospect", id: found.data[0].id, name: found.data[0].business_name };
  const merchant = await supabase.from("sync_merchants").select("id, business_name").eq("topic_slug", key).maybeSingle();
  if (merchant.error) throw fail("The businesses could not be checked.", merchant.error);
  return merchant.data ? { kind: "business", id: merchant.data.id, name: merchant.data.business_name } : null;
}

// The audit on a business that came from a prospect: its score when we started. Null if it did not come from one.
export async function prospectOfMerchant(supabase, merchantId) {
  const { data, error } = await supabase.from("sync_prospects").select("id, facts, sent_on, created_at").eq("merchant_id", merchantId).maybeSingle();
  if (error) throw fail("The audit could not be read.", error);
  return data || null;
}
