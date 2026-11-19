// The fish lists from src/data/fish.json (refreshed at build time by scripts/update-data.mjs).
import rules from "../data/rules.json" with { type: "json" };

export const CATEGORIES = ["A Realm Reborn", "Heavensward", "Stormblood", "Shadowbringers", "Endwalker", "Dawntrail", "Ocean Fishing"];
export const OCEAN_FISHING = 6;

/**
 * Dataset rows as fish objects, in the game's log order (never sort them). Spearfish use the same columns; their
 * "water" is the size class. aquarium: { itemId: [size 1–4, water] }.
 */
export function decode(T, rows = [], spear = false, aquarium = {}) {
  const oceanRegion = T.reg.indexOf(rules.oceanRegion);
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

/** { fish, spear, patch }. */
export async function loadFish() {
  const raw = (await import("../data/fish.json", { with: { type: "json" } })).default;
  return {
    fish: decode(raw.tables, raw.rows, false, raw.aquarium),
    spear: decode(raw.tables, raw.spear, true, raw.aquarium),
    patch: raw.patch,
  };
}
