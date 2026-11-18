#!/usr/bin/env node
// Builds src/data/baits.json: where to get each fishing bait: the vendors that sell it (NPC, zone, map coordinates,
// price) and who can craft it. Usage: npm run fetch:baits (network: raw.githubusercontent.com + v2.xivapi.com;
// behind a proxy on Node ≥ 22.21 run with NODE_USE_ENV_PROXY=1).
//   Baits, shops and NPC positions: FFXIV Teamcraft's data (baits.json, shops.json, npcs.json, ~27 MB, so they're
//   read here once rather than in the browser). Seasonal-event vendors are left out. Names, icons, zones and
//   recipes: XIVAPI game data.
// Output (compact; the app loads it the first time a bait is opened):
//   { fetched, currencies: { id: [name, iconPath] },
//     baits: { itemId: { name, icon, vendors: [[npc, zone, x, y, [[currencyId, amount]…]]…], crafted: [[job, level]…] } } }
import { writeFile } from "node:fs/promises";
import { XIVAPI, XIVAPI_SCHEMA } from "../src/lib/xivapi.js";
import { TEAMCRAFT_DATA } from "../src/lib/teamcraft.js";

const schema = `schema=${encodeURIComponent(XIVAPI_SCHEMA)}`;
const getJson = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };
const rowsOf = async (sheet, ids, fields) => {
  const out = [];
  for (let i = 0; i < ids.length; i += 200) out.push(...(await getJson(`${XIVAPI}/sheet/${sheet}?rows=${ids.slice(i, i + 200).join(",")}&limit=500&fields=${fields}&${schema}`)).rows);
  return out;
};
const JOBS = { Woodworking: "Carpenter", Smithing: "Blacksmith", Armorcraft: "Armorer", Goldsmithing: "Goldsmith",
  Leatherworking: "Leatherworker", Clothcraft: "Weaver", Alchemy: "Alchemist", Cooking: "Culinarian" };
const HOUSING = new Set(["Mist", "The Lavender Beds", "The Goblet", "Shirogane", "Empyreum"]);
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

process.stdout.write("Teamcraft baits, shops, NPCs… ");
const [baitList, shops, npcs] = await Promise.all(["baits", "shops", "npcs"].map(f => getJson(`${TEAMCRAFT_DATA}/${f}.json`)));
console.log("ok");
const baitIds = baitList.map(b => b.id);
const isBait = new Set(baitIds);

// vendors: every shop trade that gives a bait, at every NPC that runs the shop
const vendors = new Map(baitIds.map(id => [id, new Map()]));
const zoneIds = new Set(), currencyIds = new Set();
for (const shop of shops) for (const trade of shop.trades) for (const item of trade.items) {
  if (!isBait.has(item.id)) continue;
  const price = trade.currencies.map(c => [c.id, c.amount]);
  price.forEach(([c]) => currencyIds.add(c));
  for (const npcId of shop.npcs) {
    const npc = npcs[npcId], pos = npc?.position;
    if (!npc?.en || !pos?.zoneid) continue; // unnamed or unplaced NPCs aren't useful directions
    if (npc.festival || /seasonal/i.test(npc.title?.ja ?? "")) continue; // event vendors (Moonfire Faire…) are only there sometimes
    zoneIds.add(pos.zoneid);
    const key = `${npcId}:${JSON.stringify(price)}`;
    const name = cap(npc.en) + (npc.title?.en ? ` (${npc.title.en})` : "");
    vendors.get(item.id).set(key, [name, pos.zoneid, Math.round(pos.x * 10) / 10, Math.round(pos.y * 10) / 10, price]);
  }
}

process.stdout.write("XIVAPI names, zones, recipes… ");
const [items, zones, recipes] = await Promise.all([
  rowsOf("Item", [...baitIds, ...currencyIds], "Name,Icon"),
  rowsOf("PlaceName", [...zoneIds], "Name"),
  getJson(`${XIVAPI}/search?sheets=Recipe&limit=500&query=${encodeURIComponent(baitIds.map(id => `ItemResult=${id}`).join(" "))}`
    + `&fields=ItemResult@as(raw),CraftType.Name,RecipeLevelTable.ClassJobLevel&${schema}`),
]);
console.log("ok");
const item = new Map(items.map(r => [r.row_id, { name: r.fields.Name, icon: r.fields.Icon?.path ?? "" }]));
const zone = new Map(zones.map(r => [r.row_id, r.fields.Name]));
const crafted = new Map();
for (const r of recipes.results) {
  const id = r.fields["ItemResult@as(raw)"], craft = r.fields.CraftType?.fields?.Name, level = r.fields.RecipeLevelTable?.fields?.ClassJobLevel;
  if (!isBait.has(id) || !craft) continue;
  if (!crafted.has(id)) crafted.set(id, []);
  crafted.get(id).push([JOBS[craft] ?? craft, level]);
}

const out = { fetched: new Date().toISOString().slice(0, 10), source: "FFXIV Teamcraft + XIVAPI", currencies: {}, baits: {} };
for (const id of currencyIds) out.currencies[id] = [item.get(id)?.name ?? `Item ${id}`, item.get(id)?.icon ?? ""];
for (const id of baitIds) {
  const list = [...vendors.get(id).values()].map(([npc, z, x, y, price]) => [npc, zone.get(z) ?? "", x, y, price])
    // gil before other currencies, cheapest first, then cities before housing districts (harder to get to), by name
    .sort((a, b) => (a[4][0][0] === 1 ? 0 : 1) - (b[4][0][0] === 1 ? 0 : 1) || a[4][0][1] - b[4][0][1]
      || HOUSING.has(a[1]) - HOUSING.has(b[1]) || a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  out.baits[id] = { name: item.get(id)?.name ?? `Item ${id}`, icon: item.get(id)?.icon ?? "", vendors: list, crafted: crafted.get(id) ?? [] };
}
const body = JSON.stringify(out);
await writeFile(new URL("../src/data/baits.json", import.meta.url), body + "\n");
const sold = Object.values(out.baits).filter(b => b.vendors.length).length, made = Object.values(out.baits).filter(b => b.crafted.length).length;
console.log(`Wrote src/data/baits.json: ${baitIds.length} baits (${sold} sold by vendors, ${made} craftable), ${(body.length / 1024).toFixed(0)} KB`);
