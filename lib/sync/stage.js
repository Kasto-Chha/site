import { DAY, nepalDay } from "./time";

// Stages and the 90-day trial (patch 14a). Pure: dates in, a description out, nothing read or written here.
//
//   WIP     the trial, with onboarding inside it. The whole service runs until the decision day.
//   Active  they pay.
//   Free    they chose not to pay. The business keeps its page, QR cards and badge; we do nothing on its Google side.
//
// A trial that reaches its end date with no yes is Free. It is worked out from the dates, so nothing has to run at midnight.
// Dates are Nepal days, written "2026-12-01". Day 0 is the day the trial starts, and day 90 is the decision day.

export const STAGES = ["wip", "active", "free"];
export const STAGE_LABELS = { wip: "WIP", active: "Active", free: "Free" };
export const TRIAL_DAYS = 90;
export const MAX_TRIAL_DAYS = 365;
export const CHECKIN_DAYS = [30, 60, 80];
export const NOTE_MAX = 500;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isIsoDate(value) {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const ms = (iso) => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso, days) => new Date(ms(iso) + days * DAY).toISOString().slice(0, 10);
export const diffDays = (from, to) => Math.round((ms(to) - ms(from)) / DAY);
export const shortDate = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
export const longDate = (iso) => `${shortDate(iso)} ${iso.slice(0, 4)}`;

// What a business's stage is today. `stored` is what was saved; `stage` is what it is now: a WIP business past its end date is Free.
export function stageInfo(row, now = Date.now()) {
  const today = nepalDay(now);
  const stored = row && STAGES.includes(row.stage) ? row.stage : null;
  if (!stored || !isIsoDate(row.trial_started_on) || !isIsoDate(row.trial_ends_on)) return { known: false, today };
  const startedOn = row.trial_started_on;
  const endsOn = row.trial_ends_on;
  const total = diffDays(startedOn, endsOn);
  if (total < 0) return { known: false, today };
  const elapsed = diffDays(startedOn, today);
  const expired = stored === "wip" && today > endsOn;
  const stage = expired ? "free" : stored;
  const info = {
    known: true,
    today,
    stage,
    stored,
    expired,
    startedOn,
    endsOn,
    total,
    day: Math.min(Math.max(elapsed, 0), total),
    daysLeft: Math.max(0, diffDays(today, endsOn)),
    note: typeof row.stage_note === "string" ? row.stage_note : "",
    changedAt: row.stage_changed_at || null
  };
  if (stage === "wip") {
    // Check-ins fall on days 30, 60 and 80, and only those that come before the decision day.
    const checkins = CHECKIN_DAYS.filter((d) => d < total).map((d) => ({ day: d, on: addDays(startedOn, d) }));
    const next = checkins.find((c) => c.on >= today) || null;
    info.checkins = checkins;
    info.nextCheckin = next ? { ...next, inDays: diffDays(today, next.on) } : null;
    info.decideSoon = info.daysLeft <= 10;
  }
  return info;
}

// One line for a list: "WIP · Day 20 of 90 · ends 22 Jan".
export function stageLine(info) {
  if (!info?.known) return "No stage yet";
  if (info.stage === "wip") return `WIP · Day ${info.day} of ${info.total} · ends ${shortDate(info.endsOn)}`;
  if (info.stage === "active") return "Active";
  return info.expired ? `Free · trial ended ${shortDate(info.endsOn)}` : "Free";
}

const cleanNote = (value) => (typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "");

// Work out a move from the stage a business is in now. Returns the columns to save, or an error and the status to answer with.
// The rules: Active never goes back to a trial; Free needs the manager step ticked; an end date can only be changed on a trial.
export function planMove(row, input, now = Date.now()) {
  const info = stageInfo(row, now);
  if (!info.known) return { ok: false, status: 409, error: "This business has no stage yet. Has migration 0026 been run?" };
  const data = input && typeof input === "object" ? input : {};
  const note = cleanNote(data.note);
  if (note.length > NOTE_MAX) return { ok: false, status: 400, error: `The note can be at most ${NOTE_MAX} characters.` };
  const stamp = new Date(now).toISOString();
  const today = info.today;
  const from = info.stage;

  switch (data.action) {
    case "make_active":
      if (from !== "wip" && from !== "free") return { ok: false, status: 400, error: "This business is already Active." };
      return { ok: true, action: "make_active", from, to: "active", values: { stage: "active", stage_note: note || null, stage_changed_at: stamp } };

    case "move_to_free":
      if (from === "free") return { ok: false, status: 400, error: "This business is already Free." };
      if (data.managerRemoved !== true) {
        return { ok: false, status: 400, error: "Tick the box to confirm KastoChha has been removed as a manager on their Google profile. Free means we have no access." };
      }
      return { ok: true, action: "move_to_free", from, to: "free", values: { stage: "free", stage_note: note || null, stage_changed_at: stamp } };

    case "start_trial": {
      if (from !== "free") return { ok: false, status: 400, error: "A trial can only be started again for a Free business." };
      let days = TRIAL_DAYS;
      if (data.days !== undefined && data.days !== null && data.days !== "") {
        days = Number(data.days);
        if (!Number.isInteger(days) || days < 1 || days > MAX_TRIAL_DAYS) return { ok: false, status: 400, error: `A trial can be 1 to ${MAX_TRIAL_DAYS} days.` };
      }
      return { ok: true, action: "start_trial", from, to: "wip", values: { stage: "wip", trial_started_on: today, trial_ends_on: addDays(today, days), stage_note: note || null, stage_changed_at: stamp } };
    }

    case "change_end_date": {
      if (info.stored !== "wip") return { ok: false, status: 400, error: "The end date can only be changed on a trial." };
      if (!isIsoDate(data.endsOn)) return { ok: false, status: 400, error: "Give the new end date as a day, like 2027-01-22." };
      if (data.endsOn < today) return { ok: false, status: 400, error: "The new end date cannot be in the past. To end a trial now, use Move to Free." };
      if (data.endsOn <= info.startedOn) return { ok: false, status: 400, error: "The end date must be after the day the trial started." };
      if (data.endsOn > addDays(info.startedOn, MAX_TRIAL_DAYS)) return { ok: false, status: 400, error: `A trial cannot run longer than ${MAX_TRIAL_DAYS} days.` };
      if (!note) return { ok: false, status: 400, error: "Say why the end date is changing." };
      return { ok: true, action: "change_end_date", from, to: "wip", values: { trial_ends_on: data.endsOn, stage_note: note, stage_changed_at: stamp } };
    }

    default:
      return { ok: false, status: 400, error: "Choose what to do." };
  }
}
