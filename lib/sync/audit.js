// The Google profile audit (patch 14d): the facts a person types in from a business's public Google profile, the score they
// give, the five fixes that follow, and the three drafts. Pure and fixed: the same facts always give the same score, and the
// wording of each fix lives here, in one place. It is a snapshot of public information, never a ranking and never a promise.

// ---------- the facts ----------

export const NAME_MAX = 120;
export const DRAFT_LIMITS = { description: 750, categories: 300, festival: 500 };
export const DRAFT_LABELS = { description: "Description", categories: "Categories", festival: "Festival and holiday hours" };

// Each choice answers one question about the public profile. Anything left out is "don't know" and is left out of the score.
export const CHOICES = {
  name: { yes: "Yes, nothing extra", extra: "Has extra words", no: "No" },
  contact: { all: "All set", partial: "Some missing", none: "None set" },
  hours: { full: "Full week", partial: "Partial", none: "None" },
  festival: { yes: "Yes", no: "No" },
  description: { yes: "Yes", none: "None" },
  replies: { fast: "Within 48 hours", slowly: "Slowly", never: "Never" }
};

// Numbers: [min, max]. photoAgeMonths is how old the newest photo is; postDays is the days since the last post (999 if it never
// posted); rating has one decimal.
export const NUMBERS = {
  categories: [0, 9],
  photos: [0, 9999],
  photoAgeMonths: [0, 240],
  reviews: [0, 100000],
  waiting: [0, 100000],
  postDays: [0, 999]
};
export const RATING_RANGE = [0, 5];

export const FACT_KEYS = [...Object.keys(CHOICES), ...Object.keys(NUMBERS), "rating"];

// Takes whatever came from the browser and returns only the facts that are valid. Blank or unknown answers are dropped, a bad
// one is an error naming the question, so nothing odd is ever stored.
export function cleanFacts(input) {
  const facts = {};
  if (input === null || input === undefined) return { facts };
  if (typeof input !== "object" || Array.isArray(input)) return { error: "The facts were not understood." };
  const own = (key) => (Object.prototype.hasOwnProperty.call(input, key) ? input[key] : undefined);
  for (const [key, options] of Object.entries(CHOICES)) {
    const value = own(key);
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(options, value)) return { error: `Choose one of the answers for "${key}".` };
    facts[key] = value;
  }
  for (const [key, [min, max]] of Object.entries(NUMBERS)) {
    const value = own(key);
    if (value === undefined || value === null || value === "") continue;
    const n = typeof value === "number" ? value : /^\d{1,6}$/.test(String(value).trim()) ? Number(String(value).trim()) : NaN;
    if (!Number.isInteger(n) || n < min || n > max) return { error: `"${key}" must be a whole number from ${min} to ${max}.` };
    facts[key] = n;
  }
  const rating = own("rating");
  if (rating !== undefined && rating !== null && rating !== "") {
    const n = typeof rating === "number" ? rating : /^\d(\.\d)?$/.test(String(rating).trim()) ? Number(String(rating).trim()) : NaN;
    if (!Number.isFinite(n) || n < RATING_RANGE[0] || n > RATING_RANGE[1] || Math.abs(n * 10 - Math.round(n * 10)) > 1e-9) return { error: '"rating" must be from 0 to 5, with at most one decimal.' };
    facts.rating = Math.round(n * 10) / 10;
  }
  return { facts };
}

export const knownCount = (facts) => Object.keys(facts || {}).filter((key) => FACT_KEYS.includes(key)).length;

// ---------- the score ----------

// One scored item: its most points, and how many a set of facts earns (null when that fact is not known). 100 in all.
const ITEMS = [
  { key: "name", max: 8, fixable: true, points: (f) => (f.name === undefined ? null : { yes: 8, extra: 3, no: 0 }[f.name]) },
  { key: "contact", max: 10, fixable: true, points: (f) => (f.contact === undefined ? null : { all: 10, partial: 5, none: 0 }[f.contact]) },
  { key: "hours", max: 10, fixable: true, points: (f) => (f.hours === undefined ? null : { full: 10, partial: 5, none: 0 }[f.hours]) },
  { key: "festival", max: 8, fixable: true, points: (f) => (f.festival === undefined ? null : f.festival === "yes" ? 8 : 0) },
  { key: "categories", max: 8, fixable: true, points: (f) => (f.categories === undefined ? null : f.categories >= 3 ? 8 : f.categories === 2 ? 5 : f.categories === 1 ? 2 : 0) },
  { key: "description", max: 10, fixable: true, points: (f) => (f.description === undefined ? null : f.description === "yes" ? 10 : 0) },
  { key: "photos", max: 8, fixable: true, points: (f) => (f.photos === undefined ? null : f.photos >= 10 ? 8 : f.photos >= 5 ? 5 : f.photos >= 1 ? 2 : 0) },
  { key: "photoAge", max: 6, fixable: true, points: (f) => (f.photos === 0 ? 0 : f.photoAgeMonths === undefined ? null : f.photoAgeMonths <= 3 ? 6 : f.photoAgeMonths <= 6 ? 3 : 0) },
  { key: "rating", max: 6, fixable: false, points: (f) => (f.rating === undefined ? null : f.rating >= 4 ? 6 : f.rating >= 3.5 ? 3 : 0) },
  { key: "reviews", max: 6, fixable: false, points: (f) => (f.reviews === undefined ? null : f.reviews >= 20 ? 6 : f.reviews >= 10 ? 3 : 0) },
  { key: "waiting", max: 8, fixable: true, points: (f) => (f.waiting === undefined ? null : f.waiting === 0 ? 8 : f.waiting <= 2 ? 4 : 0) },
  { key: "replies", max: 6, fixable: true, points: (f) => (f.replies === undefined ? null : { fast: 6, slowly: 3, never: 0 }[f.replies]) },
  { key: "posts", max: 6, fixable: true, points: (f) => (f.postDays === undefined ? null : f.postDays <= 7 ? 6 : f.postDays <= 30 ? 4 : f.postDays <= 60 ? 2 : 0) }
];

// Of what is missing and can be fixed by us, the share we expect to win in a 90-day trial. Named here so it can be changed in one place.
export const FIX_SHARE = 0.7;

// -> { score, projected, checked, total, items }. The score is points earned out of the points the known facts could earn, so a
// question nobody could answer neither helps nor hurts. With no known fact there is no score (null).
export function scoreFacts(facts) {
  const f = facts && typeof facts === "object" ? facts : {};
  let earned = 0;
  let possible = 0;
  let missingFixable = 0;
  const items = ITEMS.map((item) => {
    const got = item.points(f);
    if (got === null) return { key: item.key, max: item.max, points: null, fixable: item.fixable };
    earned += got;
    possible += item.max;
    if (item.fixable) missingFixable += item.max - got;
    return { key: item.key, max: item.max, points: got, fixable: item.fixable };
  });
  const known = items.filter((item) => item.points !== null).length;
  if (!possible) return { score: null, projected: null, checked: known, total: items.length, items };
  const score = Math.round((earned / possible) * 100);
  const projected = Math.min(100, Math.max(score, Math.round(((earned + FIX_SHARE * missingFixable) / possible) * 100)));
  return { score, projected, checked: known, total: items.length, items };
}

// ---------- the five fixes ----------

const plural = (n, one, many) => (n === 1 ? one : many);

// What to do about each gap, in the words the report uses. Fixed rules: a gap in the facts gives its fix.
function allFixes(f, scored) {
  const points = Object.fromEntries(scored.items.map((item) => [item.key, item]));
  const gap = (key) => (points[key].points === null ? 0 : points[key].max - points[key].points);
  const fixes = [];
  const add = (key, title, priority, missing) => missing > 0 && fixes.push({ key, title, priority, missing });
  add("festival", "Add festival and holiday hours", "High", gap("festival"));
  add("waiting", `Answer the ${f.waiting} ${plural(f.waiting, "review", "reviews")} waiting`, "High", gap("waiting"));
  add("description", "Write a description", "High", gap("description"));
  add("contact", "Complete the address, phone and map pin", "High", gap("contact"));
  add("hours", "Complete the opening hours", "High", gap("hours"));
  add("name", "Make the name match the signboard, with nothing extra", "High", gap("name"));
  const photoGap = gap("photos") + gap("photoAge");
  add("photos", "Add real, recent photos", points.photos.points === 0 || points.photoAge.points === 0 ? "High" : "Medium", photoGap);
  add("posts", "Post an update every week", f.postDays > 60 ? "High" : "Medium", gap("posts"));
  add("categories", "Choose two or three more categories", "Medium", gap("categories"));
  add("replies", "Reply to every review within 48 hours", f.replies === "never" ? "High" : "Medium", gap("replies"));
  add("reviews", "Ask happy customers to leave a review", "Medium", gap("rating") + gap("reviews"));
  return fixes;
}

// The first five: High before Medium, then the most points missing, then a fixed order, so the same facts always give the same five.
export function buildFixes(facts) {
  const f = facts && typeof facts === "object" ? facts : {};
  const scored = scoreFacts(f);
  const order = ["festival", "waiting", "description", "contact", "hours", "name", "photos", "posts", "categories", "replies", "reviews"];
  return allFixes(f, scored)
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "High" ? -1 : 1) || b.missing - a.missing || order.indexOf(a.key) - order.indexOf(b.key))
    .slice(0, 5)
    .map(({ key, title, priority }) => ({ key, title, priority }));
}

// ---------- the drafts ----------

export function cleanDrafts(input) {
  const drafts = {};
  if (input === null || input === undefined) return { drafts };
  if (typeof input !== "object" || Array.isArray(input)) return { error: "The drafts were not understood." };
  for (const [key, max] of Object.entries(DRAFT_LIMITS)) {
    if (input[key] === undefined || input[key] === null) continue;
    if (typeof input[key] !== "string") return { error: `The ${DRAFT_LABELS[key].toLowerCase()} draft was not understood.` };
    const text = input[key].replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text.length > max) return { error: `The ${DRAFT_LABELS[key].toLowerCase()} draft can be at most ${max} characters.` };
    if (text) drafts[key] = text;
  }
  return { drafts };
}
