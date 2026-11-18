// What an owner may do (patch 14n): approve what is waiting for them, send it back with a short comment, and answer the team's
// question about a review. Pure rules first, then the database calls. An owner can only move an item that is waiting for them, and
// only inside their own business: the business comes from the signed-in account on the server, never from the browser.

export const NOTE_MAX = 300;
export const ANSWER_MAX = 1000;

// What each kind becomes. "approve" moves it forward; "change" sends it back to the team as a draft with the owner's comment.
export const KINDS = {
  menu: { table: "sync_menu_items", from: "waiting", approve: "confirmed", change: "draft" },
  post: { table: "sync_posts", from: "waiting", approve: "approved", change: "drafted" },
  reply: { table: "sync_replies", from: "waiting", approve: "approved", change: "drafted" }
};

const clean = (value) => (typeof value === "string" ? value.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim() : "");
const has = (input, key) => Object.prototype.hasOwnProperty.call(input, key);

// The browser's request -> { kind, id, decision, note } or { error }. "approve_all" is for the menu only.
export function cleanDecision(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "That was not understood." };
  const kind = has(input, "kind") ? input.kind : undefined;
  if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(KINDS, kind)) return { error: "Choose menu, post or reply." };
  const decision = has(input, "decision") ? input.decision : undefined;
  if (decision === "approve_all") {
    if (kind !== "menu") return { error: "Approve everything is only for the menu." };
    return { kind, decision };
  }
  if (decision !== "approve" && decision !== "change") return { error: "Choose approve or change." };
  const id = has(input, "id") ? input.id : undefined;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { error: "Choose what to answer." };
  if (decision === "approve") return { kind, id, decision };
  const note = clean(has(input, "note") ? input.note : "");
  if (!note) return { error: "Say what should change." };
  if (note.length > NOTE_MAX) return { error: `The comment can be at most ${NOTE_MAX} characters.` };
  return { kind, id, decision, note };
}

export function cleanAnswer(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "That was not understood." };
  const id = has(input, "id") ? input.id : undefined;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { error: "Choose which question to answer." };
  const answer = clean(has(input, "answer") ? input.answer : "");
  if (!answer) return { error: "Type your answer first." };
  if (answer.length > ANSWER_MAX) return { error: `The answer can be at most ${ANSWER_MAX} characters.` };
  return { id, answer };
}

const fail = (message, error) => Object.assign(new Error(message), { code: error?.code });

// One item, only if it is still waiting for the owner. -> true when it moved, false when it was no longer waiting (or not there).
export async function decide(supabase, merchantId, { kind, id, decision, note }, now) {
  const rule = KINDS[kind];
  const values = decision === "approve" ? { status: rule.approve, owner_note: null, updated_at: now } : { status: rule.change, owner_note: note, updated_at: now };
  const { data, error } = await supabase.from(rule.table).update(values).eq("merchant_id", merchantId).eq("id", id).eq("status", rule.from).select("id");
  if (error) throw fail("The decision could not be saved.", error);
  return Array.isArray(data) && data.length > 0;
}

// Every menu item waiting for the owner, confirmed at once. -> how many.
export async function approveAllMenu(supabase, merchantId, now) {
  const { data, error } = await supabase.from("sync_menu_items").update({ status: "confirmed", owner_note: null, updated_at: now }).eq("merchant_id", merchantId).eq("status", "waiting").select("id");
  if (error) throw fail("The decision could not be saved.", error);
  return Array.isArray(data) ? data.length : 0;
}

// The answer to the team's question, only while the review is still asking. -> true / false.
export async function answerQuestion(supabase, merchantId, id, answer, now) {
  const { data, error } = await supabase.from("sync_replies").update({ owner_answer: answer, owner_answered_at: now, updated_at: now }).eq("merchant_id", merchantId).eq("id", id).eq("status", "asking").select("id");
  if (error) throw fail("The answer could not be saved.", error);
  return Array.isArray(data) && data.length > 0;
}
