import { nepalDay } from "./time";

// The team's to-do list: one thing to do for one business (patch 13). Pure rules first, then the database calls.

export const TASK_TYPES = ["hours", "holiday", "photos", "post", "menu", "reply", "other"];
export const TASK_TYPE_LABELS = { hours: "Hours", holiday: "Holiday", photos: "Photos", post: "A post", menu: "Menu", reply: "A reply", other: "Other" };
export const TASK_SOURCES = ["whatsapp", "note", "other"];
export const TASK_SOURCE_LABELS = { whatsapp: "A WhatsApp request", note: "A private note", other: "Other" };
export const TASK_STATUSES = ["open", "waiting", "done"];
export const TASK_STATUS_LABELS = { open: "Open", waiting: "With owner", done: "Done" };
export const TITLE_MAX = 120;
export const DETAILS_MAX = 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_RE = /^[A-Za-z0-9_]{1,100}$/;

export const isUuid = (value) => UUID_RE.test(String(value || ""));
export const isAccountId = (value) => typeof value === "string" && ACCOUNT_RE.test(value);

function validDate(value) {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const clean = (value) => (typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "");

// Fields shared by a new task and an edit. Returns the ones present, checked, or an error to show.
function fields(input, { partial }) {
  const values = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  if (!partial || has("title")) {
    const title = clean(input.title);
    if (!title) return { error: "Give the task a title." };
    if (title.length > TITLE_MAX) return { error: `The title can be at most ${TITLE_MAX} characters.` };
    values.title = title;
  }
  if (has("details")) {
    const details = clean(input.details);
    if (details.length > DETAILS_MAX) return { error: `The details can be at most ${DETAILS_MAX} characters.` };
    values.details = details;
  } else if (!partial) values.details = "";
  if (has("type")) {
    if (!TASK_TYPES.includes(input.type)) return { error: "Choose a type from the list." };
    values.task_type = input.type;
  } else if (!partial) values.task_type = "other";
  if (has("assignee")) {
    if (input.assignee === null || input.assignee === "") values.assignee_user_id = null;
    else if (isAccountId(input.assignee)) values.assignee_user_id = input.assignee;
    else return { error: "That is not a valid person." };
  } else if (!partial) values.assignee_user_id = null;
  if (has("dueDate")) {
    if (input.dueDate === null || input.dueDate === "") values.due_date = null;
    else if (typeof input.dueDate === "string" && validDate(input.dueDate)) values.due_date = input.dueDate;
    else return { error: "Give the due date as a day, like 2026-12-01." };
  } else if (!partial) values.due_date = null;
  if (has("urgent")) {
    if (typeof input.urgent !== "boolean") return { error: "Urgent must be yes or no." };
    values.urgent = input.urgent;
  } else if (!partial) values.urgent = false;
  return { values };
}

// A new task. A business is required, and a task always starts open.
export function validateNewTask(body) {
  const input = body && typeof body === "object" ? body : {};
  if (!isUuid(input.merchantId)) return { error: "Choose a business." };
  const { values, error } = fields(input, { partial: false });
  if (error) return { error };
  let source = "other";
  if (Object.prototype.hasOwnProperty.call(input, "source")) {
    if (!TASK_SOURCES.includes(input.source)) return { error: "Choose where it came from." };
    source = input.source;
  }
  let sourceNoteId = null;
  if (input.sourceNoteId !== undefined && input.sourceNoteId !== null && input.sourceNoteId !== "") {
    if (!isUuid(input.sourceNoteId)) return { error: "That private note is not valid." };
    sourceNoteId = input.sourceNoteId;
  }
  return { values: { ...values, merchant_id: input.merchantId, source, source_note_id: sourceNoteId, status: "open" } };
}

// An edit: any of title, details, type, assignee, due date, urgent and status. The business and where it came from never change.
export function validateTaskPatch(body) {
  const input = body && typeof body === "object" ? body : {};
  const { values, error } = fields(input, { partial: true });
  if (error) return { error };
  if (Object.prototype.hasOwnProperty.call(input, "status")) {
    if (!TASK_STATUSES.includes(input.status)) return { error: "Choose a status from the list." };
    values.status = input.status;
  }
  if (!Object.keys(values).length) return { error: "Nothing to change." };
  return { values };
}

// Moving a task to Done stamps when; moving it out of Done clears that.
export function withStatusStamps(values, current, now = Date.now()) {
  const out = { ...values, updated_at: new Date(now).toISOString() };
  if (values.status && values.status !== current?.status) out.done_at = values.status === "done" ? new Date(now).toISOString() : null;
  return out;
}

export const nepalToday = (now = Date.now()) => nepalDay(now);

// Open or waiting, and due today or earlier (Nepal time).
export function isDueNow(task, today) {
  return Boolean(task && task.status !== "done" && task.due_date && task.due_date <= today);
}
export const countDue = (tasks, today) => (Array.isArray(tasks) ? tasks.filter((task) => isDueNow(task, today)).length : 0);

// Urgent and open first, then by due date (no date last), then newest. Done tasks go below, most recently done first.
export function sortTasks(tasks) {
  const rank = (task) => (task.status === "done" ? 2 : task.urgent ? 0 : 1);
  return [...tasks].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.status === "done") return String(b.done_at || "").localeCompare(String(a.done_at || ""));
    const da = a.due_date || "9999-12-31";
    const db = b.due_date || "9999-12-31";
    if (da !== db) return da.localeCompare(db);
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}

// ---------- the database ----------

const COLUMNS = "id, merchant_id, title, details, task_type, source, source_note_id, assignee_user_id, due_date, status, urgent, created_by, created_at, updated_at, done_at";
const fail = (message, error) => Object.assign(new Error(message), { code: error?.code });

// `merchantIds` limits the list to those businesses (an operator's); null means all (an admin's); an empty list means none.
export async function listTasks(supabase, { merchantIds = null } = {}) {
  if (Array.isArray(merchantIds) && merchantIds.length === 0) return [];
  let query = supabase.from("sync_tasks").select(COLUMNS).order("created_at", { ascending: false }).limit(1000);
  if (Array.isArray(merchantIds)) query = query.in("merchant_id", merchantIds);
  const { data, error } = await query;
  if (error) throw fail("The tasks could not be read.", error);
  return data || [];
}

// The caller checks the id's shape first (a route answers 400 for one that is not an id), so this only asks.
export async function getTask(supabase, id) {
  if (!id) return null;
  const { data, error } = await supabase.from("sync_tasks").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw fail("The task could not be read.", error);
  return data || null;
}

export async function createTask(supabase, values, createdBy) {
  const { data, error } = await supabase.from("sync_tasks").insert({ ...values, created_by: createdBy }).select(COLUMNS).single();
  if (error) throw fail("The task could not be saved.", error);
  return data;
}

export async function updateTask(supabase, id, values) {
  const { data, error } = await supabase.from("sync_tasks").update(values).eq("id", id).select(COLUMNS).single();
  if (error) throw fail("The task could not be saved.", error);
  return data;
}

export async function deleteTask(supabase, id) {
  const { error } = await supabase.from("sync_tasks").delete().eq("id", id);
  if (error) throw fail("The task could not be removed.", error);
}

// How many open tasks are due today or earlier, for the Overview tile and the menu. Exact up to a thousand.
export async function dueTaskCount(supabase, today, { merchantIds = null } = {}) {
  if (Array.isArray(merchantIds) && merchantIds.length === 0) return 0;
  let query = supabase.from("sync_tasks").select("id").neq("status", "done").lte("due_date", today).limit(1000);
  if (Array.isArray(merchantIds)) query = query.in("merchant_id", merchantIds);
  const { data, error } = await query;
  if (error) throw fail("The tasks could not be counted.", error);
  return (data || []).length;
}
