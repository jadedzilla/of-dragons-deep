// Facts for the fish view: what needs no loading, the in-game description and bait/hookset/tug (all bundled in src/data).
import { CATEGORIES, OCEAN_FISHING } from "./fishData.js";
import { xivAsset } from "./xivapi.js";
import { baitChains, hooksetAndTug, loadTeamcraft } from "./teamcraft.js";
import { loadSpots } from "./timers.js";

// AquariumFish size 1–4 (S/M/L/XL) is also the smallest tank tier that holds the fish.
const aquariumText = a => a ? `${a.water}, tier ${a.size} tanks and up (size ${["", "S", "M", "L", "XL"][a.size]})` : "Not suitable";

/** [label, value] pairs that need no loading (also on the back of a reveal card). */
export const basicFacts = f => [
  ["Location", f.zone + (f.zone !== f.region ? ", " + f.region : "")],
  [f.spear ? "Size" : "Water", f.water],
  f.cat !== OCEAN_FISHING ? ["Level", String(f.lvl)] : null,
  [f.cat === OCEAN_FISHING ? "Category" : "Expansion", CATEGORIES[f.cat]],
  ["Aquarium", aquariumText(f.aquarium)],
].filter(Boolean);

let descriptions = null;
/** The item description (src/data/descriptions.json), or null if there's none or it can't be loaded. */
export function loadDescription(id) {
  descriptions ??= import("../data/descriptions.json", { with: { type: "json" } }).then(m => m.default).catch(() => { descriptions = null; return {}; });
  return descriptions.then(d => d[id] ?? null);
}

let items = null;
/** Names and icons of fish, baits and mooches (src/data/items.json): Map(id → { name, icon }). */
export function loadItems() {
  items ??= import("../data/items.json", { with: { type: "json" } })
    .then(m => new Map(Object.entries(m.default).map(([id, [name, icon]]) => [+id, { name, icon: xivAsset(icon) }])))
    .catch(e => { items = null; throw e; });
  return items;
}

// Canvas and aquarium notes are shown as their own facts, so they're left out of the description.
const SHOWN_AS_FACTS = /^\[Suitable for (printing on .* canvases|display in aquariums)/;
/** The description's lines to show: [{ text, note }] (note = a "[…]" line). */
export const descriptionLines = text => text.split("\n").filter(l => l.trim() && !SHOWN_AS_FACTS.test(l.trim()))
  .map(l => ({ text: l, note: /^\[.*\]$/.test(l.trim()) }));

/** Fish prints: the canvas size is only in the description. */
export function canvasFrom(text) {
  const m = /printing on (extra large|small|medium|large) canvases/i.exec(text);
  if (m) return m[1][0].toUpperCase() + m[1].slice(1);
  return /Use item to acquire/i.test(text) ? "Can't be printed (minion item)" : "Can't be printed";
}

const baitInfo = new Map(); // fish id → Promise<{ groups, items: Map(id → { name, icon }), spots: { id: name }, hookset, tug }>
export function loadBait(id) {
  if (!baitInfo.has(id)) {
    baitInfo.set(id, Promise.all([loadTeamcraft("fishing-sources"), loadItems(), loadSpots()]).then(([sources, items, places]) => {
      const groups = baitChains(sources, id);
      const spots = Object.fromEntries(groups.flatMap(g => g.spots).map(s => [s, places.spots[s]?.[0] || `Spot ${s}`]));
      return { groups, items, spots, ...hooksetAndTug(sources, id) };
    }).catch(e => { baitInfo.delete(id); throw e; }));
  }
  return baitInfo.get(id);
}
