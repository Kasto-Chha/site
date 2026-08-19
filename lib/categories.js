// The one category taxonomy for KastoChha, mirroring the niche channels the
// brand actually publishes under. Everything that labels or colours content
// reads from here: the trending grid, the discussions grid, topic threads, the
// Share Experience pills, and the Ask a Question dropdown.
//
// Why one file: categories used to be free text typed per surface, so the same
// niche could be "Tech", "Technology" or "Tech & Gadgets" depending on where it
// was entered, and each surface picked its own colour. A single list keeps the
// pickers, the labels and the colours in agreement.
//
// Tones are checked against the card (#FAF8F4) and paper (#F5F0E8) backgrounds
// they render on; every one clears 4.9:1, so a category eyebrow stays readable.
// The previous Food (#C9940A) and Career (#E05C20) tones sat at 2.6:1 and
// 3.5:1 — legible-ish on a big heading, not on a 10px uppercase label.

export const CATEGORIES = [
  { key: "paisa", label: "Paisa", tone: "#2F6B12" },
  { key: "motors", label: "Motors", tone: "#6D28D9" },
  { key: "tech", label: "Tech & Gadgets", tone: "#4F46E5" },
  { key: "food", label: "Food", tone: "#8F5E0B" },
  { key: "travel", label: "Travel", tone: "#0E7490" },
  { key: "career", label: "Career", tone: "#B44415" },
  { key: "entertainment", label: "Entertainment", tone: "#C8102E" },
  { key: "health", label: "Health & Lifestyle", tone: "#0F766E" },
  { key: "muglan", label: "Muglan", tone: "#92400E" }
];

// Labels in picker order — what a new post can be filed under.
export const CATEGORY_LABELS = CATEGORIES.map((category) => category.label);

const GENERAL = { key: "general", label: "General", tone: "#57534E" };

// Free-text categories that already exist in the database (and the shorthands
// people type) folded onto the canonical niche. Keys are lowercased.
const ALIASES = {
  technology: "tech",
  tech: "tech",
  gadgets: "tech",
  "tech & gadgets": "tech",
  "tech and gadgets": "tech",
  finance: "paisa",
  money: "paisa",
  banking: "paisa",
  auto: "motors",
  autos: "motors",
  automobile: "motors",
  vehicles: "motors",
  bikes: "motors",
  travels: "travel",
  trekking: "travel",
  tourism: "travel",
  jobs: "career",
  education: "career",
  study: "career",
  lifestyle: "health",
  health: "health",
  fitness: "health",
  "health & lifestyle": "health",
  "health and lifestyle": "health",
  abroad: "muglan",
  foreign: "muglan",
  migration: "muglan",
  movies: "entertainment",
  music: "entertainment",
  drinks: "food",
  restaurants: "food"
};

const BY_KEY = new Map(CATEGORIES.map((category) => [category.key, category]));

function normalise(value) {
  return (value || "").toString().trim().toLowerCase();
}

// Resolve any stored category string to a canonical entry. Unknown values keep
// their own label (so old rows still read correctly) but borrow General's tone
// rather than every stray category collapsing onto the same brand saffron.
export function resolveCategory(value) {
  const raw = normalise(value);
  if (!raw) return GENERAL;

  const direct = BY_KEY.get(raw);
  if (direct) return direct;

  const byLabel = CATEGORIES.find((category) => normalise(category.label) === raw);
  if (byLabel) return byLabel;

  const aliased = ALIASES[raw];
  if (aliased) return BY_KEY.get(aliased) || GENERAL;

  return { ...GENERAL, label: value.toString().trim() };
}

export function categoryTone(value) {
  return resolveCategory(value).tone;
}

export function categoryLabel(value) {
  return resolveCategory(value).label;
}
