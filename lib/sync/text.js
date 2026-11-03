// "1 experience", "2 experiences": a count with the right word.
export function countLabel(count, one, many) {
  const n = Number.isFinite(Number(count)) ? Number(count) : 0;
  return `${n} ${n === 1 ? one : many}`;
}
