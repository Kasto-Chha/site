import { cleanNote } from "./feedback";
import { fetchAll } from "./paging";

// A business's reply to one post, from the account the KastoChha team linked to it.
//
// The rules, in one place:
//   - Only the account linked to the business (sync_merchants.owner_user_id) can write, edit or delete a
//     reply, and only on a post in that business's own thread. It cannot touch anyone else's post.
//   - One reply per post, and a reply cannot be replied to. (The database enforces the first.)
//   - A reply is not an experience: it is stored apart from the posts, so nothing that counts, ranks or
//     labels experiences can see it.
//   - A team member (an admin) can remove a reply, and is recorded when they do.
// Server-side apart from the pure helpers, which import nothing that needs a secret.

export const REPLY_MAX = 1500;

// The same cleaning as a private note: line breaks kept, everything that is not text removed, never shortened
// (a reply over the limit is refused, not cut).
export const cleanReply = cleanNote;

export function isOwnerOf(merchant, userId) {
  return Boolean(merchant && userId && typeof merchant.owner_user_id === "string" && merchant.owner_user_id === userId);
}

// What a browser may know of a reply. Not who wrote it: the account's id stays on the server.
export function publicReply(row) {
  if (!row) return null;
  return { id: row.id, review_id: row.review_id, body: row.body, created_at: row.created_at, edited_at: row.edited_at ?? null };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "4 Nov 2026". Written by hand, from the UTC date, so the server and the browser always agree: a date made
// with the visitor's own locale and time zone would differ between the two and break the page's hydration.
export function shortDate(iso) {
  if (typeof iso !== "string") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ---------- the database ----------

// The replies to a set of posts, as { postId: reply }, in chunks (a thread can have many posts).
export async function repliesForReviews(supabase, reviewIds) {
  const ids = [...new Set((reviewIds || []).filter((id) => typeof id === "string"))];
  const out = {};
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from("sync_owner_replies").select("id, review_id, body, created_at, edited_at").in("review_id", ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const row of data || []) out[row.review_id] = publicReply(row);
  }
  return out;
}

export async function getReply(supabase, id) {
  const { data, error } = await supabase.from("sync_owner_replies").select("*").eq("id", id).maybeSingle();
  if (error) throw Object.assign(new Error("lookup failed"), { code: error.code });
  return data || null;
}

export async function createReply(supabase, { merchantId, reviewId, userId, body }) {
  const { data, error } = await supabase
    .from("sync_owner_replies")
    .insert({ merchant_id: merchantId, review_id: reviewId, author_user_id: userId, body })
    .select()
    .single();
  // Only the code travels on: a database's message can quote the row.
  if (error) throw Object.assign(new Error("The reply could not be saved."), { code: error.code });
  return data;
}

export async function updateReply(supabase, id, body) {
  const { data, error } = await supabase.from("sync_owner_replies").update({ body, edited_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) throw Object.assign(new Error("The reply could not be saved."), { code: error.code });
  return data;
}

export async function deleteReply(supabase, id) {
  const { error } = await supabase.from("sync_owner_replies").delete().eq("id", id);
  if (error) throw Object.assign(new Error("The reply could not be removed."), { code: error.code });
}

// The threads of the businesses this account is the linked owner of. Used to stop an owner posting
// experiences about their own business. A failed read answers "none": it must never block a post.
export async function ownsThread(supabase, userId, topicSlug) {
  if (!userId || !topicSlug) return false;
  try {
    const { data, error } = await supabase
      .from("sync_merchants")
      .select("id")
      .eq("owner_user_id", userId)
      .eq("topic_slug", topicSlug)
      .in("status", ["active", "paused"])
      .limit(1);
    if (error) return false;
    return Boolean(data && data.length > 0);
  } catch {
    return false;
  }
}

// How many replies each business has written since a moment (or ever, with no moment), as a Map of business id to
// count, for the activity report. Exact: paged, and an incomplete read is an error rather than a smaller number.
export async function replyCountsByMerchant(supabase, fromIso = null) {
  const result = await fetchAll(() => {
    let query = supabase.from("sync_owner_replies").select("merchant_id, created_at").order("created_at", { ascending: true });
    if (fromIso) query = query.gte("created_at", fromIso);
    return query;
  });
  if (result.truncated) throw Object.assign(new Error("There is too much data to export in one file. Choose a shorter range."), { expected: true });
  const counts = new Map();
  for (const row of result.rows) counts.set(row.merchant_id, (counts.get(row.merchant_id) || 0) + 1);
  return counts;
}
