// The kinds of business KastoChha Sync lists, and the KastoChha category each one is
// filed under. The category is worked out from the type, on the server, and is never
// asked for: a category the browser could remember or send is how a café once ended up
// as "Career". A new kind of business (a salon, a gym) is one more line here.

export const BUSINESS_TYPES = [
  { key: "cafe", label: "Cafe", category: "Food" },
  { key: "restaurant", label: "Restaurant", category: "Food" },
  { key: "bakery", label: "Bakery", category: "Food" },
  { key: "bar", label: "Bar", category: "Food" }
];

export const DEFAULT_BUSINESS_KIND = "cafe";

export function isBusinessKind(kind) {
  return BUSINESS_TYPES.some((t) => t.key === kind);
}

// The category for a business type, or "" for one we do not know.
export function categoryForKind(kind) {
  const type = BUSINESS_TYPES.find((t) => t.key === kind);
  return type ? type.category : "";
}
