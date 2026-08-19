// Small presentational helpers shared by the homepage section components.

export function formatTimeAgo(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function delayClass(index) {
  if (index === 0) return "fi d1";
  if (index === 1) return "fi d2";
  if (index === 2) return "fi d3";
  if (index === 3) return "fi d4";
  return "fi";
}

// Per-category accent colour for eyebrows/glyphs so each card reads like a
// labelled magazine section. The tones (and the aliasing that folds legacy
// free-text categories onto a niche) live in lib/categories.js so the grids,
// the threads and the category pickers can't drift apart.
export { categoryLabel as catLabel, categoryTone as catTone } from "../../lib/categories";

// Deterministic 2-letter initials from a name, for avatars.
export function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Build a small, stable set of participant initials for a discussion avatar
// stack. Seeds from the author plus a deterministic spread so the stack looks
// populated without inventing real people.
const FILLERS = ["R", "S", "A", "P", "K", "M", "B", "D", "N", "J", "T"];

export function avatarStack(seedName, count = 3) {
  const out = [initials(seedName).slice(0, 1) || "?"];
  let cursor = (seedName || "").length;
  while (out.length < count) {
    out.push(FILLERS[cursor % FILLERS.length]);
    cursor += 3;
  }
  return out.slice(0, count);
}
