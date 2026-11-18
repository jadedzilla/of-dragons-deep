// Builds the compact fish dataset from XIVAPI: the Fish Guide (FishParameter rows with IsInLog), the spearfishing log
// (SpearfishingItem rows with IsInLog) and aquarium sizes (AquariumFish). Used by the browser (live load) and by
// scripts/fetch-fish.mjs (the committed snapshot src/data/fish.json).
// Dataset: { tables: { rec, reg, zone }, rows, spear, aquarium: { itemId: [size, water] } }, one array per fish (FISH_COLUMNS).
import { XIVAPI, SCHEMA_PARAM, field as f, getJson } from "./xivapi.js";

const FISH_COLUMNS = ["id", "name", "icon", "level", "expansion", "water", "region", "zone", "bigFish", "collectable", "rarity"];

const COMMON_FIELDS = ["IsInLog", "Item.Name", "Item.Icon", "Item.IsCollectable", "Item.Rarity",
  "GatheringItemLevel.GatheringItemLevel", "FishingRecordType.Addon.Text"];
const placeFields = spot => [`${spot}.TerritoryType.PlaceName.Name`, `${spot}.TerritoryType.PlaceNameRegion.Name`];
const FIELDS = ["Unknown1", ...COMMON_FIELDS, ...placeFields("FishingSpot")].join(",");
const SPEAR_FIELDS = ["Unknown2", ...COMMON_FIELDS, ...placeFields("SpearfishingNotebook")].join(",");
const PAGE = 500;  // XIVAPI's maximum page size
const WINDOWS = 4; // FishParameter pages fetched in parallel up front (the Fish Guide is rows 1…~1520)

const pageUrl = (after, sheet = "FishParameter", fields = FIELDS) =>
  `${XIVAPI}/sheet/${sheet}?limit=${PAGE}&${SCHEMA_PARAM}&fields=${fields}` + (after >= 0 ? `&after=${after}` : "");

/** FishParameter rows: parallel windows, then more pages while they still hold Fish Guide rows. */
async function fishParameterRows(opts) {
  const pages = await Promise.all(Array.from({ length: WINDOWS }, (_, i) => getJson(pageUrl(i * PAGE - 1), opts)));
  const byId = new Map();
  for (const p of pages) for (const r of p.rows) byId.set(r.row_id, r);
  let last = pages.at(-1);
  while (last.rows.length === PAGE && last.rows.some(r => r.fields.IsInLog)) {
    last = await getJson(pageUrl(last.rows.at(-1).row_id), opts);
    for (const r of last.rows) byId.set(r.row_id, r);
  }
  return { rows: [...byId.values()], version: pages[0].version };
}

/** Every row of a small sheet (one page today; keeps paging if it grows). */
async function allRows(sheet, fields, opts) {
  const rows = [];
  for (let after = -1; ;) {
    const p = await getJson(pageUrl(after, sheet, fields), opts);
    rows.push(...p.rows);
    if (p.rows.length < PAGE) return rows;
    after = p.rows.at(-1).row_id;
  }
}

/** Game patch (e.g. "7.58") for an XIVAPI version key; null if unknown. */
const patchName = (versions, key) => versions?.find(v => v.key === key)?.names.find(n => n !== "latest") ?? null;

/**
 * The game's log order: by sort key, then row. Keys are per expansion (2000 A Realm Reborn … 7000 Dawntrail), ocean
 * fishing after its expansion (5001…), so a fish added to an older expansion later lands with that expansion.
 */
export function logOrder(rows, key = "Unknown1") {
  return [...rows].sort((a, b) => (a.fields[key] ?? 0) - (b.fields[key] ?? 0) || a.row_id - b.row_id);
}

// Earliest expansion of each region (0 ARR … 5 Dawntrail): a fish's level band is raised to its region's expansion.
const REGION_EXPANSION = {
  "Dravania": 1, "Abalathia's Spine": 1,
  "Gyr Abania": 2, "Othard": 2, "Hingashi": 2,
  "Norvrandt": 3,
  "The Northern Empty": 4, "Ilsabard": 4, "The Sea of Stars": 4, "The World Unsundered": 4,
  "Yok Tural": 5, "Xak Tural": 5, "Unlost World": 5,
};
function expansionOf(level, region) {
  const byLevel = level <= 50 ? 0 : level <= 60 ? 1 : level <= 70 ? 2 : level <= 80 ? 3 : level <= 90 ? 4 : 5;
  return Math.max(byLevel, REGION_EXPANSION[region] ?? 0);
}
/** Spearfish: the sort key's thousand (4000 = Stormblood → 2); level/region rule if out of range. */
function spearExpansion(row, level, region) {
  const bucket = Math.floor((row.fields.Unknown2 ?? 0) / 1000) - 2;
  return bucket >= 0 && bucket <= 5 ? bucket : expansionOf(level, region);
}

const inLog = rows => rows.filter(r => r.fields.IsInLog && f(r, "Item")?.value > 0);

function buildDataset(fishParameterRows, meta, spearfishingRows = [], aquariumRows = []) {
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

/** Both logs (and aquarium sizes) from XIVAPI as a dataset. */
export async function loadFishFromXivapi({ fetchFn = fetch, signal } = {}) {
  const opts = { fetchFn, signal };
  const [{ rows, version }, spearRows, aquariumRows, versions] = await Promise.all([
    fishParameterRows(opts),
    allRows("SpearfishingItem", SPEAR_FIELDS, opts),
    // Item@as(raw): just the item id (plain Item expands the whole row: ~4.6 MB instead of ~40 KB). Optional.
    allRows("AquariumFish", "Item@as(raw),Size,AquariumWater.Name", opts).catch(() => []),
    getJson(`${XIVAPI}/version`, opts).then(d => d.versions, () => null),
  ]);
  const meta = { fetched: new Date().toISOString().slice(0, 10), version, patch: patchName(versions, version) };
  return buildDataset(rows, meta, spearRows, aquariumRows);
}
