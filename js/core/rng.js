export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function chance(p) {
  return Math.random() < p;
}
export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
export function weightedPick(entries) {
  // entries: [{key, weight}]
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.key;
  }
  return entries[entries.length - 1].key;
}
