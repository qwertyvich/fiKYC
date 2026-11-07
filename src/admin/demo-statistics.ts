// Generated examples are confined to the administrator's labelled preview.
// Never write these values to Catalog, reviews or the public API.
export function demoStatistics(ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  let seed = 146959810;
  for (const c of sorted.join('|')) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return (seed + 1) / 4294967297;
  };
  const ranks = sorted.map((id) => ({ id, key: random() })).sort((a, b) => a.key - b.key);
  const lowerCount = Math.round(sorted.length * 0.8),
    lowerIds = new Set(ranks.slice(0, lowerCount).map((r) => r.id));
  return sorted.map((id) => {
    let value = 0;
    do {
      const normal = Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
      value = Math.round(110 + normal * 32);
    } while (value < 30 || value > 190);
    return { id, buyerCount: value, rating: lowerIds.has(id) ? 4.9 : 5 };
  });
}
