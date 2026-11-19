// src/data/items.json: name and icon of every fish, bait and mooch the app names ({ itemId: [name, iconPath] }), and
// src/data/descriptions.json: every log fish's in-game description ({ itemId: text }), from XIVAPI.
import { baitChains } from "../../src/lib/teamcraft.js";
import { xivRows } from "./xivapi.mjs";

export async function fetchItems(teamcraft) {
  const sources = teamcraft["fishing-sources"], ids = new Set();
  for (const [id, entries] of Object.entries(sources)) {
    ids.add(+id);
    for (const e of entries) for (const p of e.predators ?? []) ids.add(p.id);
    for (const g of baitChains(sources, +id)) for (const c of g.chains) c.forEach(i => ids.add(i));
  }
  const out = {};
  for (const r of await xivRows("Item", [...ids], "Name,Icon")) out[r.row_id] = [r.fields.Name ?? "", r.fields.Icon?.path ?? ""];
  return out;
}

export async function fetchDescriptions(fish) {
  const ids = [...fish.rows, ...fish.spear].map(r => r[0]), out = {};
  for (const r of await xivRows("Item", ids, "Description")) if (r.fields.Description) out[r.row_id] = r.fields.Description;
  if (Object.keys(out).length < ids.length * 0.9) throw new Error("too few descriptions");
  return out;
}
