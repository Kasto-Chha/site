// What a business owner sees on their dashboard (patch 14m, part 1). The owner is the account the team linked to the business
// (sync_merchants.owner_user_id), found on the server and never taken from the browser. An owner sees only their own business and
// only the owner-facing parts: the Google figures, the monthly report, the profile checklist, and the customer notes the team has
// passed on. Never the team's tasks, private notes, the note typed with the figures, or the audit log. Server only.

import { isOwnerOf } from "./ownerReplies";
import { buildMonthly } from "./monthly";
import { lastMonth, listNumbers, parseMonth } from "./googleNumbers";
import { listChecks } from "./health";
import { listPosts } from "./posts";
import { listItems } from "./menu";
import { listReplies } from "./replies";
import { listTasks } from "./tasks";
import { readStage } from "./stageStore";
import { stageInfo } from "./stage";

const fail = (message, error) => Object.assign(new Error(message), { code: error?.code });
const NOTE_LIMIT = 200;

// The businesses linked to this account: just what a picker needs.
export async function listOwnedBusinesses(supabase, userId) {
  if (typeof userId !== "string" || !userId) return [];
  const { data, error } = await supabase.from("sync_merchants").select("id, business_name, area").eq("owner_user_id", userId).limit(50);
  if (error) throw fail("The businesses could not be read.", error);
  return (data || []).map((row) => ({ id: row.id, name: row.business_name, area: row.area }));
}

// The one business of this owner, or null (not theirs, or not there: the same answer, so a stranger learns nothing).
export async function getOwnedBusiness(supabase, userId, merchantId) {
  if (typeof userId !== "string" || !userId || typeof merchantId !== "string") return null;
  const { data, error } = await supabase.from("sync_merchants").select("id, business_name, area, business_kind, owner_user_id").eq("id", merchantId).maybeSingle();
  if (error) throw fail("The business could not be read.", error);
  if (!data || !isOwnerOf(data, userId)) return null;
  return { id: data.id, business_name: data.business_name, area: data.area, business_kind: data.business_kind };
}

// The customer notes the team has passed on to this business, newest first. A note the team has not passed on is never returned.
export async function listOwnerNotes(supabase, merchantId) {
  const { data, error } = await supabase
    .from("sync_feedback")
    .select("id, message, contact, is_urgent, status, created_at, shared_with_owner_at")
    .eq("merchant_id", merchantId)
    .in("status", ["in_digest", "resolved"])
    .order("created_at", { ascending: false })
    .limit(NOTE_LIMIT + 200);
  if (error) throw fail("The notes could not be read.", error);
  return (data || [])
    .filter((row) => row.shared_with_owner_at)
    .slice(0, NOTE_LIMIT)
    .map((row) => ({ id: row.id, message: row.message, contact: row.contact || "", urgent: Boolean(row.is_urgent) && row.status !== "resolved", done: row.status === "resolved", created_at: row.created_at }));
}

export const noteCounts = (notes) => ({ all: notes.length, urgent: notes.filter((n) => n.urgent).length, done: notes.filter((n) => n.done).length });

export function filterNotes(notes, filter) {
  if (filter === "urgent") return notes.filter((n) => n.urgent);
  if (filter === "done") return notes.filter((n) => n.done);
  return notes;
}
export const parseNoteFilter = (value) => (["urgent", "done"].includes(Array.isArray(value) ? value[0] : value) ? (Array.isArray(value) ? value[0] : value) : "all");

// The whole home for one owner and business: null when the business is not theirs. month: "2026-10" or empty (the latest typed).
export async function ownerHome(supabase, userId, merchantId, { month = "", today }) {
  const merchant = await getOwnedBusiness(supabase, userId, merchantId);
  if (!merchant) return null;
  const [numbers, checks, posts, replies, tasks, notes, stageRow] = await Promise.all([
    listNumbers(supabase, merchant.id),
    listChecks(supabase, merchant.id, 60),
    listPosts(supabase, merchant.id),
    listReplies(supabase, merchant.id),
    listTasks(supabase, { merchantIds: [merchant.id] }),
    listOwnerNotes(supabase, merchant.id),
    readStage(supabase, merchant.id).catch(() => null)
  ]);
  const months = numbers.map((row) => String(row.month).slice(0, 7)).slice(0, 6);
  const asked = parseMonth(month);
  const chosen = (asked && months.includes(asked.slice(0, 7)) ? asked.slice(0, 7) : months[0]) || lastMonth(today).slice(0, 7);
  const report = buildMonthly({ merchant, month: chosen, numbers, checks, posts, replies, tasks });
  // The note typed with the figures is for the team. It is never part of what an owner sees.
  report.note = "";
  const info = stageInfo(stageRow);
  return {
    business: { id: merchant.id, name: merchant.business_name, area: merchant.area, kind: merchant.business_kind },
    free: Boolean(info.known && info.stage === "free"),
    report,
    months,
    notes: noteCounts(notes)
  };
}

// What is waiting for this owner (patch 14n): menu items to check, posts and reply drafts to approve, and the team's questions about
// reviews. Only owner-safe fields: never a post's team title, who made it, or any team note. null when the business is not theirs.
export async function ownerNeeds(supabase, userId, merchantId) {
  const merchant = await getOwnedBusiness(supabase, userId, merchantId);
  if (!merchant) return null;
  const [items, posts, replies, stageRow] = await Promise.all([
    listItems(supabase, merchant.id),
    listPosts(supabase, merchant.id),
    listReplies(supabase, merchant.id),
    readStage(supabase, merchant.id).catch(() => null)
  ]);
  const info = stageInfo(stageRow);
  const free = Boolean(info.known && info.stage === "free");
  const waiting = (rows) => (free ? [] : rows.filter((row) => row.status === "waiting"));
  const menu = waiting(items).map((r) => ({ id: r.id, section: r.section || "", name: r.name, price: r.price ?? null, unit: r.unit || "", description: r.description || "" }));
  const postRows = waiting(posts).map((r) => ({ id: r.id, kind: r.kind, planned_on: r.planned_on || null, body: r.body || "", button_link: r.button_link || "" }));
  const replyRows = waiting(replies).map((r) => ({ id: r.id, reviewer: r.reviewer || "", stars: r.stars ?? null, review: r.review || "", review_on: r.review_on || null, draft: r.draft || "" }));
  const questions = (free ? [] : replies.filter((row) => row.status === "asking")).map((r) => ({ id: r.id, reviewer: r.reviewer || "", stars: r.stars ?? null, review: r.review || "", review_on: r.review_on || null, question: r.team_question || "", answer: r.owner_answer || "" }));
  return {
    business: { id: merchant.id, name: merchant.business_name },
    free,
    menu,
    posts: postRows,
    replies: replyRows,
    questions,
    total: menu.length + postRows.length + replyRows.length + questions.filter((q) => !q.answer).length
  };
}
