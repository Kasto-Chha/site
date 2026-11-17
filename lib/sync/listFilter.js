import { STAGES, stageInfo } from "./stage";

// The Businesses list: which stage filter is chosen, what was typed in the search box, and which businesses are shown.
// Pure, so it can be tested. The list never trusts the address: anything odd falls back to "all businesses".

export const FILTERS = ["all", ...STAGES];
export const FILTER_LABELS = { all: "All", wip: "WIP", active: "Active", free: "Free" };
export const SEARCH_MAX = 80;

const one = (value) => (Array.isArray(value) ? value[0] : value);

// From the page's search params -> { stage, q }.
export function parseListQuery(searchParams) {
  const params = searchParams && typeof searchParams === "object" ? searchParams : {};
  const stageRaw = String(one(params.stage) ?? "").toLowerCase();
  const stage = FILTERS.includes(stageRaw) ? stageRaw : "all";
  const q = String(one(params.q) ?? "").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX);
  return { stage, q };
}

// The stage a business is in today. One that cannot be read (no stage row) is "unknown": it is shown under All only.
export function stageOf(stageRow, now = Date.now()) {
  const info = stageInfo(stageRow, now);
  return info.known ? info.stage : "unknown";
}

const norm = (value) => String(value ?? "").toLowerCase();

export function matchesSearch(merchant, q) {
  if (!q) return true;
  const needle = norm(q);
  return [merchant.business_name, merchant.area, merchant.topic_slug, merchant.slug].some((field) => norm(field).includes(needle));
}

// How many businesses are in each stage, among those matching the search (so the chips always add up to what is on screen).
export function stageCounts(merchants, stageRows, q = "", now = Date.now()) {
  const counts = { all: 0, wip: 0, active: 0, free: 0 };
  for (const merchant of merchants || []) {
    if (!matchesSearch(merchant, q)) continue;
    counts.all += 1;
    const stage = stageOf(stageRows?.get?.(merchant.id), now);
    if (stage in counts) counts[stage] += 1;
  }
  return counts;
}

export function filterBusinesses(merchants, stageRows, { stage = "all", q = "" } = {}, now = Date.now()) {
  return (merchants || []).filter((merchant) => {
    if (!matchesSearch(merchant, q)) return false;
    if (stage === "all") return true;
    return stageOf(stageRows?.get?.(merchant.id), now) === stage;
  });
}

// The address a chip points to, keeping the search.
export function listHref(stage, q) {
  const params = new URLSearchParams();
  if (stage && stage !== "all") params.set("stage", stage);
  if (q) params.set("q", q);
  const text = params.toString();
  return `/admin/sync/businesses${text ? `?${text}` : ""}`;
}
