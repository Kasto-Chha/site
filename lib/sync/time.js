// Nepal time, for the parts of Sync that count days. Nepal is UTC+05:45 all year, with no daylight
// saving, so a day is the same length always and turns over at 18:15 UTC. Pure.
export const DAY = 24 * 60 * 60 * 1000;
export const NEPAL_OFFSET_MS = 345 * 60 * 1000;

// "2026-11-04": the Nepal day a moment falls in.
export function nepalDay(ms) {
  return new Date(ms + NEPAL_OFFSET_MS).toISOString().slice(0, 10);
}

// The first instant (in ms) of the Nepal day a moment falls in.
export function nepalDayStart(ms) {
  return Date.parse(`${nepalDay(ms)}T00:00:00Z`) - NEPAL_OFFSET_MS;
}
