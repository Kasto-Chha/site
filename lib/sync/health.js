// Profile health (patch 14h): 22 checks of what the public Google profile shows, typed in by hand until the Google connection
// exists. Fixed rules, not a ranking: the same answers always give the same result. Pure rules first, then the database calls.

export const GROUPS = [
  { key: "basics", label: "Basics" },
  { key: "hours", label: "Hours" },
  { key: "words", label: "Words" },
  { key: "photos", label: "Photos" },
  { key: "reviews", label: "Reviews" },
  { key: "posts", label: "Posts" }
];

const YESNO = { type: "choice", options: { yes: "Yes", no: "No" } };
const num = (min, max, unit) => ({ type: "number", min, max, unit });

// Each check: the fact it needs, the question to ask, how it is judged, and what to do when it fails. state() returns "pass", "fix",
// or null when the answer is not known (left empty), so an unknown check neither helps nor hurts.
const CHECKS = [
  { key: "name", group: "basics", label: "Name matches the signboard, nothing extra", facts: ["name"], q: "Does the name match the signboard, with nothing extra?", input: { type: "choice", options: { yes: "Yes, nothing extra", extra: "Has extra words", no: "No" } }, state: (f) => pick(f.name, { yes: 1 }), fix: "Change the name to exactly what the signboard says, with no keywords or area added.", task: "other" },
  { key: "contact", group: "basics", label: "Address, phone and map pin all set", facts: ["contact"], q: "Are the address, phone and map pin all set?", input: { type: "choice", options: { all: "All set", partial: "Some missing", none: "None set" } }, state: (f) => pick(f.contact, { all: 1 }), fix: "Check the address and phone number and that the map pin sits on the door.", task: "other" },
  { key: "website", group: "basics", label: "Website link set", facts: ["website"], q: "Is a website link set?", input: YESNO, state: (f) => pick(f.website, { yes: 1 }), fix: "Add the business's website, or its KastoChha page, as the website link.", task: "other" },
  { key: "category", group: "basics", label: "The right main category", facts: ["category"], q: "Is the main category right?", input: YESNO, state: (f) => pick(f.category, { yes: 1 }), fix: "Choose the main category that describes the place best.", task: "other" },
  { key: "hours", group: "hours", label: "Regular hours are set", facts: ["hours"], q: "Are the regular opening hours filled in?", input: { type: "choice", options: { full: "Full week", partial: "Partial", none: "None" } }, state: (f) => pick(f.hours, { full: 1 }), fix: "Fill in the opening time for every day and mark the closed days.", task: "hours" },
  { key: "festival", group: "hours", label: "Festival and special hours are set", facts: ["festival"], q: "Are festival and special hours set?", input: YESNO, state: (f) => pick(f.festival, { yes: 1 }), fix: "Add special hours for each festival and public holiday.", task: "holiday" },
  { key: "closures", group: "hours", label: "Holiday closures set in advance", facts: ["closures"], q: "Are holiday closures set in advance?", input: YESNO, state: (f) => pick(f.closures, { yes: 1 }), fix: "Mark the days the business will be closed before they come.", task: "holiday" },
  { key: "description", group: "words", label: "A description is written", facts: ["description"], q: "Is there a description?", input: YESNO, state: (f) => pick(f.description, { yes: 1 }), fix: "Write a short description in the owner's own words.", task: "other" },
  { key: "extraCategories", group: "words", label: "Two or more extra categories", facts: ["extraCategories"], q: "How many extra categories are chosen, besides the main one?", input: num(0, 9), state: (f) => atLeast(f.extraCategories, 2), fix: "Add the two or three extra categories that describe the place.", task: "other" },
  { key: "services", group: "words", label: "Services or products listed", facts: ["services"], q: "Are services or products listed?", input: YESNO, state: (f) => pick(f.services, { yes: 1 }), fix: "List the main services or products.", task: "menu" },
  { key: "photos", group: "photos", label: "Ten or more real photos", facts: ["photos"], q: "How many photos are there?", input: num(0, 9999), state: (f) => atLeast(f.photos, 10), fix: "Add real photos taken by the business until there are ten or more.", task: "photos" },
  { key: "recentPhoto", group: "photos", label: "A photo from the last 90 days", facts: ["photos", "photoAgeDays"], q: "How many days old is the newest photo?", input: num(0, 3650, "days"), fact: "photoAgeDays", state: (f) => (f.photos === 0 ? "fix" : atMost(f.photoAgeDays, 90)), fix: "Add a fresh photo taken in the last three months.", task: "photos" },
  { key: "logo", group: "photos", label: "Logo and cover are set", facts: ["logo"], q: "Are the logo and cover photo set?", input: YESNO, state: (f) => pick(f.logo, { yes: 1 }), fix: "Set the logo and a cover photo.", task: "photos" },
  { key: "menuPhoto", group: "photos", label: "A photo of the menu or best sellers", facts: ["menuPhoto"], q: "Is there a photo of the menu or the best sellers?", input: YESNO, state: (f) => pick(f.menuPhoto, { yes: 1 }), fix: "Add a clear photo of the menu or the best sellers.", task: "photos" },
  { key: "rating", group: "reviews", label: "Rating is 4.0 or higher", facts: ["rating"], q: "What is the star rating?", input: { type: "rating" }, state: (f) => atLeast(f.rating, 4), fix: "A rating cannot be changed by us. Ask happy customers, in person, to leave an honest review.", task: "other" },
  { key: "reviewCount", group: "reviews", label: "Twenty or more reviews", facts: ["reviews"], q: "How many reviews are there?", input: num(0, 1000000), state: (f) => atLeast(f.reviews, 20), fix: "Ask happy customers, in person, to leave an honest review. A small sign with a QR code helps.", task: "other" },
  { key: "answered", group: "reviews", label: "Every review is answered", facts: ["waiting"], q: "How many reviews have no reply?", input: num(0, 100000), state: (f) => atMost(f.waiting, 0), fix: "Reply to every review that has no answer.", task: "reply" },
  { key: "fast", group: "reviews", label: "Answered within 48 hours", facts: ["replies"], q: "How are new reviews answered?", input: { type: "choice", options: { fast: "Within 48 hours", slowly: "Slowly", never: "Never" } }, state: (f) => pick(f.replies, { fast: 1 }), fix: "Check reviews twice a week and answer each within 48 hours.", task: "reply" },
  { key: "recentPost", group: "posts", label: "A post in the last 30 days", facts: ["postDays"], q: "Days since the last post (999 if it never posted)", input: num(0, 999, "days"), state: (f) => atMost(f.postDays, 30), fix: "Make a post this week.", task: "post" },
  { key: "offer", group: "posts", label: "An offer or event posted", facts: ["offer"], q: "Has an offer or event been posted?", input: YESNO, state: (f) => pick(f.offer, { yes: 1 }), fix: "Post an offer or an event.", task: "post" },
  { key: "weekly", group: "posts", label: "A post every week", facts: ["postsMonth"], q: "How many posts in the last 4 weeks?", input: num(0, 60), state: (f) => atLeast(f.postsMonth, 4), fix: "Post once a week: a dish, an offer, a festival greeting.", task: "post" },
  { key: "postLink", group: "posts", label: "Posts have a button or link", facts: ["postLink"], q: "Do the posts have a button or link?", input: YESNO, state: (f) => pick(f.postLink, { yes: 1 }), fix: "Add a button or link to each post.", task: "post" }
];

function pick(value, passing) {
  if (value === undefined || value === null) return null;
  return passing[value] ? "pass" : "fix";
}
const atLeast = (value, n) => (typeof value === "number" ? (value >= n ? "pass" : "fix") : null);
const atMost = (value, n) => (typeof value === "number" ? (value <= n ? "pass" : "fix") : null);

export const CHECK_KEYS = CHECKS.map((c) => c.key);
export const checkByKey = (key) => CHECKS.find((c) => c.key === key) || null;

// The questions for the form, in order, one per fact (the recent-photo check and the photo-count check each ask their own).
export const QUESTIONS = (() => {
  const out = [];
  const seen = new Set();
  for (const check of CHECKS) {
    const key = check.fact || check.facts[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, group: check.group, q: check.q, input: check.input });
  }
  return out;
})();
export const FACT_KEYS = QUESTIONS.map((q) => q.key);

// ---------- the answers ----------

// From the browser -> { facts } (only valid answers; blanks are "not known") or { error } naming the question.
export function cleanHealthFacts(input) {
  if (input === null || input === undefined) return { facts: {} };
  if (typeof input !== "object" || Array.isArray(input)) return { error: "The answers were not understood." };
  const own = (key) => (Object.prototype.hasOwnProperty.call(input, key) ? input[key] : undefined);
  const facts = {};
  for (const question of QUESTIONS) {
    const value = own(question.key);
    if (value === undefined || value === null || value === "") continue;
    const spec = question.input;
    if (spec.type === "choice") {
      if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(spec.options, value)) return { error: `Choose one of the answers for "${question.q}"` };
      facts[question.key] = value;
    } else if (spec.type === "number") {
      const text = String(value).trim().replace(/,/g, "");
      const n = /^\d{1,7}$/.test(text) ? Number(text) : NaN;
      if (!Number.isInteger(n) || n < spec.min || n > spec.max) return { error: `"${question.q}" must be a whole number from ${spec.min} to ${spec.max}.` };
      facts[question.key] = n;
    } else {
      const text = String(value).trim();
      const n = /^\d(\.\d)?$/.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(n) || n < 0 || n > 5) return { error: "The rating must be from 0 to 5, with at most one decimal." };
      facts[question.key] = n;
    }
  }
  return { facts };
}

// ---------- the result ----------

// Facts -> every check's state, by group, and the counts. The score is the share of the checks that could be judged which pass.
export function evaluate(facts) {
  const f = facts && typeof facts === "object" ? facts : {};
  const results = CHECKS.map((check) => ({ key: check.key, group: check.group, label: check.label, state: check.state(f) || "unknown", fix: check.fix, task: check.task }));
  const count = (state) => results.filter((r) => r.state === state).length;
  const passing = count("pass");
  const failing = count("fix");
  const unknown = count("unknown");
  const known = passing + failing;
  return {
    score: known === 0 ? null : Math.round((passing / known) * 100),
    passing, failing, unknown, known,
    total: results.length,
    results,
    groups: GROUPS.map((group) => {
      const checks = results.filter((r) => r.group === group.key);
      return { ...group, checks, passing: checks.filter((c) => c.state === "pass").length, failing: checks.filter((c) => c.state === "fix").length, total: checks.length };
    })
  };
}

export const gaps = (facts) => evaluate(facts).results.filter((r) => r.state === "fix");

// The task a gap becomes. Its title is the same every time, so a gap that already has an open task is not made twice.
export const TASK_PREFIX = "Profile health: ";
export function taskFor(result) {
  return { title: `${TASK_PREFIX}${result.label}`.slice(0, 120), details: result.fix, type: result.task };
}

// ---------- the database ----------

const COLUMNS = "id, merchant_id, checked_on, facts, passing, failing, unknown, score, checked_by, created_at";

// Newest first.
export async function listChecks(supabase, merchantId, limit = 12) {
  const { data, error } = await supabase.from("sync_health_checks").select(COLUMNS).eq("merchant_id", merchantId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw Object.assign(new Error("The checks could not be read."), { code: error.code });
  return data || [];
}

// A new snapshot. The counts are worked out here, from the facts, never taken from the browser.
export async function saveCheck(supabase, merchantId, facts, today, userId) {
  const result = evaluate(facts);
  const row = { merchant_id: merchantId, checked_on: today, facts, passing: result.passing, failing: result.failing, unknown: result.unknown, score: result.score, checked_by: userId };
  const { data, error } = await supabase.from("sync_health_checks").insert(row).select(COLUMNS);
  if (error) throw Object.assign(new Error("The check could not be saved."), { code: error.code });
  return { check: Array.isArray(data) ? data[0] : data, result };
}
