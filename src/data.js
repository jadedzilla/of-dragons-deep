// Loads fish data. First choice is live: the Fish Guide straight from XIVAPI's game data
// (it sends Access-Control-Allow-Origin: *), built into the dataset by src/fishsource.js.
// If that fails or is too slow, falls back to the committed snapshot data/fish.json
// (inlined as window.__FISH_DATA__ in the single-file build).
import { loadFishFromXivapi } from "./fishsource.js";

export const CATEGORIES = ["A Realm Reborn", "Heavensward", "Stormblood", "Shadowbringers", "Endwalker", "Dawntrail", "Ocean Fishing"];
export const OCEAN_FISHING = 6;
const LIVE_TIMEOUT_MS = 15000;

async function loadLive() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LIVE_TIMEOUT_MS);
  try {
    const data = await loadFishFromXivapi({ signal: ctrl.signal });
    if (!data.rows.length) throw new Error("XIVAPI returned no fish");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function loadSnapshot() {
  return window.__FISH_DATA__ ?? await fetch("data/fish.json").then(r => {
    if (!r.ok) throw new Error(`Could not load data/fish.json (${r.status})`);
    return r.json();
  });
}

// Row order is the in-game Fish Guide order (the same order as the FFXIV Fish Tracker's Fish Guide). The grid shows
// fish in this order (left to right, top to bottom, 100 per page), so never sort these rows.
function decode({ tables: T, rows }) {
  const oceanRegion = T.reg.indexOf("The High Seas");
  return rows.map(([id, name, icon, lvl, exp, water, region, zone, big, collectable, rarity]) => ({
    id,
    name: name.trim(),
    icon,                                      // game icon id, e.g. 29063 → icon 029063
    lvl,
    cat: region === oceanRegion ? OCEAN_FISHING : exp,
    water: T.rec[water],
    region: T.reg[region],
    zone: T.zone[zone],
    big: big === 1 || rarity >= 2,             // rarity ≥ 2 = big fish (also covers ocean-fishing rares)
    collectable: collectable === 1,
  }));
}

/** Returns { fish, live, fetched, error } — `live` false means the snapshot was used, with `error` saying why. */
export async function loadFish() {
  try {
    const raw = await loadLive();
    return { fish: decode(raw), live: true, fetched: raw.fetched, patch: raw.patch };
  } catch (e) {
    const error = e.name === "AbortError" ? "timed out" : e.message;
    console.warn(`Live fish data unavailable (${error}); using snapshot.`);
    const raw = await loadSnapshot();
    return { fish: decode(raw), live: false, fetched: raw.fetched, patch: raw.patch, error };
  }
}
