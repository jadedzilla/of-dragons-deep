// Fishing details from FFXIV Teamcraft's data files (github.com/ffxiv-teamcraft/ffxiv-teamcraft, libs/data/src/lib/json),
// fetched from raw.githubusercontent.com (CORS *, gzipped) when first needed and shared by the fish view and the timers:
//   fishing-sources.json       { itemId: [{ spot, bait, hookset, tug, spawn?, duration?, weathers?, weathersFrom?,
//                                            oceanFishingTime?, … }] }  one entry per fishing spot (FishingSpot row id)
//   spearfishing-sources.json  { itemId: [{ speed, shadowSize, spawn?, duration?, … }] }
// Names, icons, places and weather come from XIVAPI game data.

import { XIVAPI, XIVAPI_SCHEMA } from "./fishsource.js";

export const TEAMCRAFT_DATA = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const teamcraftFiles = new Map(); // file name → Promise<json>; dropped on failure so the next call retries
export function loadTeamcraft(name, fetchFn = fetch) {
  if (!teamcraftFiles.has(name)) {
    teamcraftFiles.set(name, fetchFn(`${TEAMCRAFT_DATA}/${name}.json`).then(r => {
      if (!r.ok) throw new Error(`Teamcraft HTTP ${r.status}`);
      return r.json();
    }).catch(e => { teamcraftFiles.delete(name); throw e; }));
  }
  return teamcraftFiles.get(name);
}

export const xivAsset = path => `${XIVAPI}/asset?path=${encodeURIComponent(path)}&format=png`;

/** XIVAPI rows of `sheet` for the given row ids (in chunks, so URLs stay short). */
export async function xivRows(sheet, ids, fields, { fetchFn = fetch, signal } = {}) {
  const unique = [...new Set(ids)], rows = [];
  for (let i = 0; i < unique.length; i += 200) {
    const r = await fetchFn(`${XIVAPI}/sheet/${sheet}?rows=${unique.slice(i, i + 200).join(",")}&limit=500`
      + `&fields=${fields}&schema=${encodeURIComponent(XIVAPI_SCHEMA)}`, { signal });
    if (!r.ok) throw new Error(`XIVAPI HTTP ${r.status}`);
    rows.push(...(await r.json()).rows);
  }
  return rows;
}

/**
 * A fish's bait, grouped by spot: [{ chains: [[itemId…]…], spots: [spotId…] }], most spots first. Spots with the same
 * baits share a group; several chains in one group are alternatives (e.g. ocean fishing, where most baits work).
 * In a chain, [0] is the bait and any later items are fish to mooch with, each caught on the one before (same spot).
 */
export function baitChains(sources, itemId) {
  const bySpot = new Map(); // spot → chains
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

// Teamcraft's codes (checked against the FFXIV Fish Tracker's labels): anything else means unknown.
const HOOKSETS = { 1: "Powerful", 2: "Precision" };
const TUGS = { 0: "Medium (!!)", 1: "Heavy (!!!)", 2: "Light (!)" };
/** A fish's hookset and tug as display strings ("Precision", "Light (!)"); several if they differ by spot; null if unknown. */
export function hooksetAndTug(sources, itemId) {
  const distinct = (key, names) => [...new Set((sources[itemId] ?? []).map(e => names[e[key]]).filter(Boolean))].join(" or ") || null;
  return { hookset: distinct("hookset", HOOKSETS), tug: distinct("tug", TUGS) };
}
