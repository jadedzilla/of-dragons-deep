// Facts for the fish view: what needs no loading, the in-game description (XIVAPI) and bait/hookset/tug (Teamcraft).
import { CATEGORIES, OCEAN_FISHING } from "./fishData.js";
import { XIVAPI, SCHEMA_PARAM, xivAsset, xivRows } from "./xivapi.js";
import { baitChains, hooksetAndTug, loadTeamcraft } from "./teamcraft.js";

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

const descriptions = new Map(); // item id → Promise<string|null>
/** The item description, or null if it can't be loaded (retried next time). */
export function loadDescription(id) {
  if (!descriptions.has(id)) {
    descriptions.set(id, fetch(`${XIVAPI}/sheet/Item/${id}?fields=Description&${SCHEMA_PARAM}`)
      .then(r => r.ok ? r.json() : null).then(d => d?.fields?.Description || null, () => null)
      .then(text => { if (text === null) descriptions.delete(id); return text; }));
  }
  return descriptions.get(id);
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

const baitInfo = new Map(); // fish id → Promise<{ groups, items: { id: { name, icon } }, spots: { id: name }, hookset, tug }>
export function loadBait(id) {
  if (!baitInfo.has(id)) {
    baitInfo.set(id, loadTeamcraft("fishing-sources").then(async sources => {
      const groups = baitChains(sources, id);
      const [itemRows, spotRows] = await Promise.all([
        groups.length ? xivRows("Item", groups.flatMap(g => g.chains.flat()), "Name,Icon") : [],
        groups.length > 1 ? xivRows("FishingSpot", groups.flatMap(g => g.spots), "PlaceName.Name") : [],
      ]);
      const items = Object.fromEntries(itemRows.map(r => [r.row_id, { name: r.fields.Name, icon: r.fields.Icon?.path ? xivAsset(r.fields.Icon.path) : null }]));
      const spots = Object.fromEntries(spotRows.map(r => [r.row_id, r.fields.PlaceName?.fields?.Name || `Spot ${r.row_id}`]));
      return { groups, items, spots, ...hooksetAndTug(sources, id) };
    }).catch(e => { baitInfo.delete(id); throw e; }));
  }
  return baitInfo.get(id);
}
