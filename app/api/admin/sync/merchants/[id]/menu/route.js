import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../../../../lib/supabase/server";
import { syncAccess } from "../../../../../../../lib/sync/access";
import { isAssigned } from "../../../../../../../lib/sync/team";
import { closeAuditEntry, openAuditEntry } from "../../../../../../../lib/admin/audit";
import { logDbError } from "../../../../../../../lib/dbError";
import { BODY_LIMITS, readJsonBody } from "../../../../../../../lib/requestBody";
import { ITEM_LIMIT, changesContent, cleanItem, createItem, deleteItem, listItems, moveAll, neighbour, updateItem } from "../../../../../../../lib/sync/menu";
import { stageInfo } from "../../../../../../../lib/sync/stage";
import { readStage } from "../../../../../../../lib/sync/stageStore";
import { nepalDay } from "../../../../../../../lib/sync/time";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIT_FAILED = "Could not record this change in the audit log, so nothing was changed.";
const FREE = "This business is on the Free plan: we do not work on its Google profile, so nothing is listed.";

// An admin may use this for any business; an operator only for one assigned to them (an unassigned one looks like it does not
// exist). A Free business is held. A stage that cannot be read never blocks.
async function gate(params, { allowFree = false } = {}) {
  const authResult = await syncAccess();
  if (!authResult.ok) return { response: NextResponse.json({ error: "Unauthorized" }, { status: authResult.status }) };
  if (!UUID_RE.test(params.id || "")) return { response: NextResponse.json({ error: "Invalid id." }, { status: 400 }) };
  const supabase = createServerSupabase();
  if (!authResult.isAdmin && !(await isAssigned(supabase, authResult.userId, params.id))) return { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  const found = await supabase.from("sync_merchants").select("id").eq("id", params.id).maybeSingle();
  if (found.error) {
    logDbError("sync menu merchant", found.error);
    return { response: NextResponse.json({ error: "Could not load that business." }, { status: 500 }) };
  }
  if (!found.data) return { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  try {
    const info = stageInfo(await readStage(supabase, params.id));
    if (!allowFree && info.known && info.stage === "free") return { response: NextResponse.json({ error: FREE }, { status: 409 }) };
  } catch {
    // Not blocked by a failed read.
  }
  return { authResult, supabase };
}

async function logged(supabase, authResult, action, merchantId, after, work) {
  let auditId;
  try {
    auditId = await openAuditEntry(supabase, { actorId: authResult.userId, action, targetType: "sync_merchant", targetId: merchantId, before: null, after });
  } catch (auditError) {
    console.error(`${action}:`, auditError.message);
    return { response: NextResponse.json({ error: AUDIT_FAILED }, { status: 500 }) };
  }
  try {
    const result = await work();
    await closeAuditEntry(supabase, auditId, { applied: true });
    return { result };
  } catch (error) {
    await closeAuditEntry(supabase, auditId, { applied: false });
    logDbError(action, error);
    return { response: NextResponse.json({ error: "Could not save. Has migration 0034 been run?" }, { status: 500 }) };
  }
}

const UUID = (v) => UUID_RE.test(String(v || ""));
const nowIso = () => new Date().toISOString();
const SEND = { send: ["draft", "waiting"], confirm: ["waiting", "confirmed"] };

async function readAll(supabase, merchantId) {
  try {
    return { items: await listItems(supabase, merchantId) };
  } catch (error) {
    logDbError("sync menu read", error);
    return { response: NextResponse.json({ error: "Could not read the list." }, { status: 500 }) };
  }
}

// Add an item: { name, section?, description?, price?, unit? }. It starts as a draft, at the end of the list.
export async function POST(request, { params }) {
  const g = await gate(params, { allowFree: false });
  if (g.response) return g.response;
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const { status: _status, ...input } = parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data) ? parsed.data : {};
  const { values, error } = cleanItem(input);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const all = await readAll(g.supabase, params.id);
  if (all.response) return all.response;
  if (all.items.length >= ITEM_LIMIT) return NextResponse.json({ error: `A list can have at most ${ITEM_LIMIT} items.` }, { status: 400 });
  const position = all.items.reduce((top, item) => Math.max(top, item.position ?? 0), 0) + 1;
  const done = await logged(g.supabase, g.authResult, "sync.menu.create", params.id, { status: "draft" }, () => createItem(g.supabase, params.id, values, g.authResult.userId, nowIso(), position));
  if (done.response) return done.response;
  return NextResponse.json({ ok: true, id: done.result.id });
}

// Change an item: { itemId, ...fields } or { itemId, move: "up" | "down" }. Changing what an item says makes it a draft again.
export async function PATCH(request, { params }) {
  const g = await gate(params, { allowFree: false });
  if (g.response) return g.response;
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const itemId = parsed.data?.itemId;
  if (!UUID(itemId)) return NextResponse.json({ error: "Invalid item." }, { status: 400 });
  const { itemId: _ignored, move, ...fields } = parsed.data;
  const all = await readAll(g.supabase, params.id);
  if (all.response) return all.response;
  const existing = all.items.find((item) => item.id === itemId);
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (move !== undefined) {
    if (move !== "up" && move !== "down") return NextResponse.json({ error: "Move up or down." }, { status: 400 });
    const other = neighbour(all.items, itemId, move);
    if (!other) return NextResponse.json({ ok: true, moved: false });
    const done = await logged(g.supabase, g.authResult, "sync.menu.move", params.id, { itemId, move }, async () => {
      const now = nowIso();
      // Items made one after the other can share a position; give the pair distinct ones before swapping.
      const a = existing.position ?? 0;
      const b = other.position ?? 0;
      const [first, second] = a === b ? (move === "up" ? [a - 1, a] : [a + 1, a]) : [b, a];
      await updateItem(g.supabase, params.id, itemId, { position: first }, now);
      await updateItem(g.supabase, params.id, other.id, { position: second }, now);
    });
    if (done.response) return done.response;
    return NextResponse.json({ ok: true, moved: true });
  }

  const { values, error } = cleanItem(fields, { partial: true });
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!("status" in values) && existing.status !== "draft" && changesContent(values, existing)) values.status = "draft";
  if (values.status === "waiting") values.owner_note = null;
  const status = values.status || existing.status;
  const done = await logged(g.supabase, g.authResult, "sync.menu.update", params.id, { itemId, status }, () => updateItem(g.supabase, params.id, itemId, values, nowIso()));
  if (done.response) return done.response;
  return NextResponse.json({ ok: true, status });
}

// The whole list at once: { action: "send" } puts every draft with the owner, { action: "confirm" } confirms every one waiting.
export async function PUT(request, { params }) {
  const g = await gate(params, { allowFree: false });
  if (g.response) return g.response;
  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const pair = Object.prototype.hasOwnProperty.call(SEND, parsed.data?.action) ? SEND[parsed.data.action] : null;
  if (!pair) return NextResponse.json({ error: "Choose send or confirm." }, { status: 400 });
  const done = await logged(g.supabase, g.authResult, "sync.menu.bulk", params.id, { action: parsed.data.action }, () => moveAll(g.supabase, params.id, pair[0], pair[1], nowIso()));
  if (done.response) return done.response;
  return NextResponse.json({ ok: true, changed: done.result });
}

// Remove an item: /menu?item=<id>. Allowed for a Free business too.
export async function DELETE(request, { params }) {
  const g = await gate(params, { allowFree: true });
  if (g.response) return g.response;
  const itemId = new URL(request.url).searchParams.get("item");
  if (!UUID(itemId)) return NextResponse.json({ error: "Invalid item." }, { status: 400 });
  const done = await logged(g.supabase, g.authResult, "sync.menu.delete", params.id, { itemId }, () => deleteItem(g.supabase, params.id, itemId));
  if (done.response) return done.response;
  if (!done.result) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
