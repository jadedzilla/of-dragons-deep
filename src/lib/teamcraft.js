// FFXIV Teamcraft's fishing data (github.com/ffxiv-teamcraft/ffxiv-teamcraft, libs/data/src/lib/json; CORS *):
//   fishing-sources.json       { itemId: [{ spot, bait, hookset, tug, spawn?, duration?, weathers?, weathersFrom?, … }] }
//   spearfishing-sources.json  { itemId: [{ spawn?, duration?, … }] }
//   fishing-spots.json         [{ id (FishingSpot), zoneId (PlaceName), … }]
export const TEAMCRAFT_DATA = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const files = new Map(); // name → Promise; dropped on failure so the next call retries
export function loadTeamcraft(name, fetchFn = fetch) {
  if (!files.has(name)) {
    files.set(name, fetchFn(`${TEAMCRAFT_DATA}/${name}.json`).then(r => {
      if (!r.ok) throw new Error(`Teamcraft HTTP ${r.status}`);
      return r.json();
    }).catch(e => { files.delete(name); throw e; }));
  }
  return files.get(name);
}

/**
 * A fish's bait by spot: [{ chains: [[itemId…]…], spots: [spotId…] }], most spots first. Spots with the same baits share
 * a group; chains in a group are alternatives. In a chain, [0] is the bait and later items are fish to mooch with.
 */
export function baitChains(sources, itemId) {
  const bySpot = new Map();
  for (const e of sources[itemId] ?? []) {
    const chain = [];
    for (let bait = e.bait; bait && chain.length < 8 && !chain.includes(bait);) {
      chain.unshift(bait);
      const src = sources[bait];
      if (!src) break; // a real bait, not a fish
      bait = (src.find(s => s.spot === e.spot) ?? src[0]).bait;
    }
    const chains = bySpot.get(e.spot) ?? [];
    if (!chains.some(c => c.join() === chain.join())) chains.push(chain);
    bySpot.set(e.spot, chains);
  }
  const groups = new Map();
  for (const [spot, chains] of bySpot) {
    const key = chains.map(c => c.join(">")).sort().join("|");
    if (!groups.has(key)) groups.set(key, { chains, spots: [] });
    groups.get(key).spots.push(spot);
  }
  return [...groups.values()].sort((a, b) => b.spots.length - a.spots.length);
}

// Teamcraft's codes (checked against the FFXIV Fish Tracker's labels); anything else is unknown.
const HOOKSETS = { 1: "Powerful", 2: "Precision" };
const TUGS = { 0: "Medium (!!)", 1: "Heavy (!!!)", 2: "Light (!)" };

/** Hookset and tug as text, joined with "or" when they differ by spot; null if unknown. */
export function hooksetAndTug(sources, itemId) {
  const distinct = (key, names) => [...new Set((sources[itemId] ?? []).map(e => names[e[key]]).filter(Boolean))].join(" or ") || null;
  return { hookset: distinct("hookset", HOOKSETS), tug: distinct("tug", TUGS) };
}

export const isTimedEntry = e => e.spawn !== undefined || e.weathers?.length > 0 || e.weathersFrom?.length > 0;
