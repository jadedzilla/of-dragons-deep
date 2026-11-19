// src/data/fish.json: the Fish Guide (FishParameter rows with IsInLog), the spearfishing log (SpearfishingItem rows with
// IsInLog) and aquarium sizes (AquariumFish), as a compact dataset:
//   { version, patch, columns, tables: { rec, reg, zone }, rows, spear, aquarium: { itemId: [size, water] } }
// one array per fish (FISH_COLUMNS), in the game's log order.
import rules from "../../src/data/rules.json" with { type: "json" };
import { XIVAPI, allRows, field as f, getJson } from "./xivapi.mjs";

const FISH_COLUMNS = ["id", "name", "icon", "level", "expansion", "water", "region", "zone", "bigFish", "collectable", "rarity"];

const COMMON_FIELDS = ["IsInLog", "Item.Name", "Item.Icon", "Item.IsCollectable", "Item.Rarity",
  "GatheringItemLevel.GatheringItemLevel", "FishingRecordType.Addon.Text"];
const placeFields = spot => [`${spot}.TerritoryType.PlaceName.Name`, `${spot}.TerritoryType.PlaceNameRegion.Name`];
const FIELDS = ["Unknown1", ...COMMON_FIELDS, ...placeFields("FishingSpot")].join(",");
const SPEAR_FIELDS = ["Unknown2", ...COMMON_FIELDS, ...placeFields("SpearfishingNotebook")].join(",");

/** Game patch (e.g. "7.58") for an XIVAPI version key; null if unknown. */
const patchName = (versions, key) => versions?.find(v => v.key === key)?.names.find(n => n !== "latest") ?? null;

/**
 * The game's log order: by sort key, then row. Keys are per expansion (2000 A Realm Reborn … 7000 Dawntrail), ocean
 * fishing after its expansion (5001…), so a fish added to an older expansion later lands with that expansion.
 */
export function logOrder(rows, key = "Unknown1") {
  return [...rows].sort((a, b) => (a.fields[key] ?? 0) - (b.fields[key] ?? 0) || a.row_id - b.row_id);
}

/** Level band, raised to the region's expansion when that's later. */
export function expansionOf(level, region) {
  const byLevel = rules.levelBands.filter(top => level > top).length;
  return Math.max(byLevel, rules.regionExpansion[region] ?? 0);
}
/** Spearfish: the sort key's thousand (4000 = Stormblood → 2); level/region rule if out of range. */
function spearExpansion(row, level, region) {
  const bucket = Math.floor((row.fields.Unknown2 ?? 0) / 1000) - 2;
  return bucket >= 0 && bucket <= rules.levelBands.length ? bucket : expansionOf(level, region);
}

const inLog = rows => rows.filter(r => r.fields.IsInLog && f(r, "Item")?.value > 0);

export function buildDataset(fishParameterRows, meta, spearfishingRows = [], aquariumRows = []) {
  const tables = { rec: [], reg: [], zone: [] };
  const idx = (t, v) => {
    let i = tables[t].indexOf(v);
    if (i < 0) { i = tables[t].length; tables[t].push(v); }
    return i;
  };
  const toRow = (spot, expansion) => r => {
    const level = f(r, "GatheringItemLevel", "GatheringItemLevel");
    const territory = f(r, spot, "TerritoryType");
    const region = f(territory, "PlaceNameRegion", "Name") ?? "", zone = f(territory, "PlaceName", "Name") ?? "";
    const rarity = f(r, "Item", "Rarity");
    return [
      f(r, "Item").value, f(r, "Item", "Name"), f(r, "Item", "Icon")?.id ?? 0, level, expansion(r, level, region),
      idx("rec", f(r, "FishingRecordType", "Addon", "Text") ?? ""), idx("reg", region), idx("zone", zone),
      rarity >= 2 ? 1 : 0, f(r, "Item", "IsCollectable") ? 1 : 0, rarity,
    ];
  };
  const rows = logOrder(inLog(fishParameterRows)).map(toRow("FishingSpot", (_, level, region) => expansionOf(level, region)));
  const spear = logOrder(inLog(spearfishingRows), "Unknown2").map(toRow("SpearfishingNotebook", spearExpansion));
  const ours = new Set([...rows, ...spear].map(r => r[0]));
  const aquariumItem = r => r.fields["Item@as(raw)"] ?? f(r, "Item")?.value;
  const aquarium = Object.fromEntries(aquariumRows
    .filter(r => ours.has(aquariumItem(r)) && r.fields.Size > 0)
    .map(r => [aquariumItem(r), [r.fields.Size, f(r, "AquariumWater", "Name") ?? ""]]));
  return { source: `${XIVAPI}/sheet/FishParameter`, ...meta, columns: FISH_COLUMNS, tables, rows, spear, aquarium };
}

export async function fetchFish() {
  const [fish, spear, aquarium, versions] = await Promise.all([
    // the Fish Guide is rows 1…~1520 plus a few far later: keep paging while a page still holds guide rows
    allRows("FishParameter", FIELDS, p => !p.rows.some(r => r.fields.IsInLog)),
    allRows("SpearfishingItem", SPEAR_FIELDS),
    // Item@as(raw): just the item id (plain Item expands the whole row: ~4.6 MB instead of ~40 KB)
    allRows("AquariumFish", "Item@as(raw),Size,AquariumWater.Name"),
    getJson(`${XIVAPI}/version`).then(d => d.versions),
  ]);
  const data = buildDataset(fish.rows, { version: fish.version, patch: patchName(versions, fish.version) }, spear.rows, aquarium.rows);
  if (data.rows.length < 1000) throw new Error(`only ${data.rows.length} Fish Guide fish`);
  return data;
}
