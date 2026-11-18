// Loads the fish lists: live from XIVAPI, else the committed snapshot (src/data/fish.json) if that fails or takes over 15 s.
import { loadFishFromXivapi } from "./fishSource.js";

export const CATEGORIES = ["A Realm Reborn", "Heavensward", "Stormblood", "Shadowbringers", "Endwalker", "Dawntrail", "Ocean Fishing"];
export const OCEAN_FISHING = 6;
const LIVE_TIMEOUT_MS = 15000;

async function loadLive(fetchFn) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LIVE_TIMEOUT_MS);
  try {
    const data = await loadFishFromXivapi({ fetchFn, signal: ctrl.signal });
    if (!data.rows.length) throw new Error("XIVAPI returned no fish");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const loadSnapshot = () => import("../data/fish.json").then(m => m.default);

/**
 * Dataset rows as fish objects, in the game's log order (never sort them). Spearfish use the same columns; their
 * "water" is the size class. aquarium: { itemId: [size 1–4, water] }.
 */
export function decode(T, rows = [], spear = false, aquarium = {}) {
  const oceanRegion = T.reg.indexOf("The High Seas");
  return rows.map(([id, name, icon, lvl, exp, water, region, zone, big, collectable, rarity]) => ({
    id,
    name: name.trim(),
    icon,
    lvl,
    cat: !spear && region === oceanRegion ? OCEAN_FISHING : exp,
    water: T.rec[water],
    region: T.reg[region],
    zone: T.zone[zone],
    big: big === 1 || rarity >= 2, // big fish and ocean-fishing rares
    collectable: collectable === 1,
    spear,
    aquarium: aquarium[id] ? { size: aquarium[id][0], water: aquarium[id][1] } : null,
  }));
}

const lists = (raw, extra) => ({
  fish: decode(raw.tables, raw.rows, false, raw.aquarium),
  spear: decode(raw.tables, raw.spear, true, raw.aquarium),
  fetched: raw.fetched, patch: raw.patch, ...extra,
});

/** { fish, spear, live, fetched, patch, error }; live false = the snapshot (error says why). */
export async function loadFish({ fetchFn = fetch } = {}) {
  try {
    return lists(await loadLive(fetchFn), { live: true });
  } catch (e) {
    const error = e.name === "AbortError" ? "timed out" : e.message;
    console.warn(`Live fish data unavailable (${error}); using snapshot.`);
    return lists(await loadSnapshot(), { live: false, error });
  }
}
