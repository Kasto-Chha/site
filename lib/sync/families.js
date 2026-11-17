// What kind of page a business gets (patch 14c). A business's Type decides its family, and the family decides the words and the
// checklist its page uses: a hotel is not asked about a menu, a cafe is not asked about rooms. Pure, and one place to add a
// family later (the way "other businesses get help from other features" was agreed): add its types to a list below.
//
// The database is not touched: the type is already stored, and a family is worked out from it each time.

export const FAMILY_FOOD = "food";
export const FAMILY_STAY = "stay";
export const FAMILY_GENERAL = "general";

const FOOD_KINDS = ["cafe", "restaurant", "bakery", "bar", "sweet_shop"];
const STAY_KINDS = ["hotel", "homestay"];

export function familyOf(kind) {
  if (FOOD_KINDS.includes(kind)) return FAMILY_FOOD;
  if (STAY_KINDS.includes(kind)) return FAMILY_STAY;
  return FAMILY_GENERAL;
}

const FAMILIES = {
  [FAMILY_FOOD]: {
    pageLabel: "Food page",
    itemsWord: "Menu",
    steps: ["Add the menu and its prices", "Keep opening hours and holidays up to date", "Add photos of the food and the place", "Reply to every review, good and bad"]
  },
  [FAMILY_STAY]: {
    pageLabel: "Hotel page",
    itemsWord: "Rooms and rates",
    steps: ["Add the room types and their rates", "Add the booking link, phone and WhatsApp", "Add photos of the rooms, the view and the entrance", "Reply to every review, good and bad"]
  },
  [FAMILY_GENERAL]: {
    pageLabel: "Business page",
    itemsWord: "Services",
    steps: ["Add what the business sells or does", "Keep opening hours and holidays up to date", "Add photos of the place and the work", "Reply to every review, good and bad"]
  }
};

export const familyInfo = (kind) => FAMILIES[familyOf(kind)];

// The stored task type "menu" is the business's list of what it offers. It keeps one stored value (the database allows a fixed
// set), and each family names it in its own words.
export function taskTypeLabel(type, labels, kind) {
  if (type === "menu") return familyInfo(kind).itemsWord;
  return labels[type] || labels.other || "Other";
}
