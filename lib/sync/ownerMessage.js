// Messaging an owner on WhatsApp, by hand (patch 14o). The team's own phone sends it: this builds the words and the link that opens
// WhatsApp with them, and remembers the owner's number and when the team last messaged. No WhatsApp service is used. The message
// holds counts and the owner's link only, never a review, a price, a name or a comment. Pure rules first, then the database calls.

const fail = (message, error) => Object.assign(new Error(message), { code: error?.code });

// A number as typed -> digits with the country code, "" for none, or { error }. Nepal mobiles (10 digits starting 9) get 977.
export function cleanWhatsapp(input) {
  if (input === undefined || input === null) return { value: "" };
  if (typeof input !== "string" && typeof input !== "number") return { error: "That number was not understood." };
  const text = String(input).trim();
  if (!text) return { value: "" };
  if (text.length > 30 || !/^\+?[0-9 ()\-]+$/.test(text)) return { error: "A number can only have digits, spaces, + ( ) and -." };
  let digits = text.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("9")) digits = `977${digits}`;
  
  if (digits.length < 8 || digits.length > 15) return { error: "Type the number with its country code, for example 977 9841 000 000." };
  return { value: digits };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// What is waiting for the owner, from the business's three lists. Counts only.
export function summarizeWaiting({ menu = [], posts = [], replies = [] }) {
  const counts = {
    menu: menu.filter((r) => r.status === "waiting").length,
    posts: posts.filter((r) => r.status === "waiting").length,
    replies: replies.filter((r) => r.status === "waiting").length,
    questions: replies.filter((r) => r.status === "asking" && !r.owner_answer).length
  };
  return { counts, total: counts.menu + counts.posts + counts.replies + counts.questions };
}

export function buildMessage({ businessName, counts, total }, link) {
  const name = String(businessName || "your business").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!(total > 0)) return `Namaste! Nothing is waiting for you on KastoChha for ${name} right now. Your page: ${link}`;
  const parts = [];
  if (counts.menu) parts.push(plural(counts.menu, "menu item to check", "menu items to check"));
  if (counts.posts) parts.push(plural(counts.posts, "post to check", "posts to check"));
  if (counts.replies) parts.push(plural(counts.replies, "reply to check", "replies to check"));
  if (counts.questions) parts.push(plural(counts.questions, "question from us", "questions from us"));
  return `Namaste! ${total === 1 ? "1 thing needs you" : `${total} things need you`} for ${name} on KastoChha: ${parts.join(", ")}.\n\nPlease open this and tap "Looks right" or "Needs a change":\n${link}\n\nNothing goes on Google until you approve it. Thank you!`;
}

// The address that opens WhatsApp with the words ready. With no number it opens WhatsApp's own "choose a contact".
export function whatsappLink(number, text) {
  const digits = typeof number === "string" && /^[0-9]{8,15}$/.test(number) ? number : "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// The saved number and the last time. Never throws: { failed: true } when the columns cannot be read (migration not run).
export async function readOwnerContact(supabase, merchantId) {
  const { data, error } = await supabase.from("sync_merchants").select("owner_whatsapp, owner_messaged_at").eq("id", merchantId).maybeSingle();
  if (error) return { whatsapp: "", messagedAt: null, failed: true };
  return { whatsapp: data?.owner_whatsapp || "", messagedAt: data?.owner_messaged_at || null, failed: false };
}

export async function saveWhatsapp(supabase, merchantId, number) {
  const { data, error } = await supabase.from("sync_merchants").update({ owner_whatsapp: number || null }).eq("id", merchantId).select("id");
  if (error) throw fail("The number could not be saved.", error);
  return Array.isArray(data) && data.length > 0;
}

export async function markMessaged(supabase, merchantId, now) {
  const { data, error } = await supabase.from("sync_merchants").update({ owner_messaged_at: now }).eq("id", merchantId).select("id");
  if (error) throw fail("That could not be saved.", error);
  return Array.isArray(data) && data.length > 0;
}
