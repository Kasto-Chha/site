// The kinds of business KastoChha Sync lists, grouped by the KastoChha category each one
// is filed under by default. The category is worked out from the type on the server. It
// can be changed by hand, deliberately (the form's "Change category"), and the server
// accepts only one of KastoChha's own categories for that. It is never a value a browser
// can keep from an earlier choice: that is how a cafe once ended up as "Career".
//
// To list a new kind of business, add a line to the group it belongs to. The type is
// stored as plain text, so no migration is needed.

const GROUPS = [
  {
    category: "Food",
    types: [
      { key: "cafe", label: "Cafe" },
      { key: "restaurant", label: "Restaurant" },
      { key: "bakery", label: "Bakery" },
      { key: "bar", label: "Bar" },
      { key: "sweet_shop", label: "Sweet shop" }
    ]
  },
  {
    category: "Health & Lifestyle",
    types: [
      { key: "salon", label: "Salon" },
      { key: "spa", label: "Spa" },
      { key: "gym", label: "Gym" },
      { key: "yoga_studio", label: "Yoga studio" }
    ]
  },
  {
    category: "Travel",
    types: [
      { key: "hotel", label: "Hotel" },
      { key: "homestay", label: "Homestay" },
      { key: "travel_agency", label: "Travel or trekking agency" }
    ]
  },
  {
    category: "Tech & Gadgets",
    types: [
      { key: "mobile_shop", label: "Mobile shop" },
      { key: "electronics_shop", label: "Electronics shop" },
      { key: "gadget_repair", label: "Gadget repair" }
    ]
  },
  {
    category: "Motors",
    types: [
      { key: "vehicle_showroom", label: "Vehicle showroom" },
      { key: "garage", label: "Garage" },
      { key: "car_wash", label: "Car wash" }
    ]
  },
  {
    category: "Career",
    types: [{ key: "training_institute", label: "Training institute" }]
  },
  {
    category: "Other",
    types: [
      { key: "general_shop", label: "General shop" },
      { key: "grocery", label: "Grocery" },
      { key: "clothing_store", label: "Clothing store" },
      { key: "other_business", label: "Other business" }
    ]
  }
];

export const BUSINESS_GROUPS = GROUPS;

// The flat list: { key, label, category }.
export const BUSINESS_TYPES = GROUPS.flatMap((g) => g.types.map((t) => ({ ...t, category: g.category })));

export const DEFAULT_BUSINESS_KIND = "cafe";

export function isBusinessKind(kind) {
  return BUSINESS_TYPES.some((t) => t.key === kind);
}

// The category a business type is filed under by default, or "" for one we do not know.
export function categoryForKind(kind) {
  const type = BUSINESS_TYPES.find((t) => t.key === kind);
  return type ? type.category : "";
}

export function labelForKind(kind) {
  const type = BUSINESS_TYPES.find((t) => t.key === kind);
  return type ? type.label : "";
}
