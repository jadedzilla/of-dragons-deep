// Loads the Fish Guide and the spearfishing log from XIVAPI (game data) into the compact dataset the app reads:
// { tables: { rec, reg, zone }, rows: [...Fish Guide], spear: [...spearfishing log] }, one array per fish (FISH_COLUMNS).
// Shared by the browser (live load in src/data.js) and scripts/fetch-fish-data.mjs (committed snapshot).
// Replaced the FFXIV Fish Tracker (ff14fish.carbuncleplushy.com) as the source; output was verified identical.
//
// Fish Guide = FishParameter rows with IsInLog. Spearfishing log = SpearfishingItem rows with IsInLog. For each:
//   Item.Name / Item.Icon / Item.IsCollectable / Item.Rarity    name, icon id, collectable, rarity (≥2 = big fish)
//   GatheringItemLevel.GatheringItemLevel                       level
//   FishingRecordType.Addon.Text                                water type (Coastlines, Rivers, …); for
//                                                               spearfish the size class (Small/Average/Big)
//   FishingSpot (fish) / SpearfishingNotebook (spearfish)
//     .TerritoryType.PlaceNameRegion / PlaceName                region / zone
//   Unknown1 (fish) / Unknown2 (spearfish)                      the game's log sort key (see logOrder)
// Requests pin the XIVAPI schema revision so field names (notably Unknown1/Unknown2) can't change under us.

export const XIVAPI = "https://v2.xivapi.com/api";
export const XIVAPI_SCHEMA = "exdschema@2:rev:e773c41a90aed788cf4c1c48469fa85618ef01fb";
export const FISH_COLUMNS = ["id", "name", "icon", "level", "expansion", "water", "region", "zone", "bigFish", "collectable", "rarity"];

const COMMON_FIELDS = [
  "IsInLog", "Item.Name", "Item.Icon", "Item.IsCollectable", "Item.Rarity",
  "GatheringItemLevel.GatheringItemLevel", "FishingRecordType.Addon.Text",
];
const placeFields = spot => [`${spot}.TerritoryType.PlaceName.Name`, `${spot}.TerritoryType.PlaceNameRegion.Name`];
const FIELDS = ["Unknown1", ...COMMON_FIELDS, ...placeFields("FishingSpot")].join(",");
const SPEAR_FIELDS = ["Unknown2", ...COMMON_FIELDS, ...placeFields("SpearfishingNotebook")].join(",");
const PAGE = 500;          // XIVAPI's maximum page size
const WINDOWS = 4;         // FishParameter pages fetched in parallel up front (the Fish Guide is rows 1…~1520)

const pageUrl = (after, sheet = "FishParameter", fields = FIELDS) =>
  `${XIVAPI}/sheet/${sheet}?limit=${PAGE}&schema=${encodeURIComponent(XIVAPI_SCHEMA)}`
  + `&fields=${fields}` + (after >= 0 ? `&after=${after}` : "");

async function getJson(url, fetchFn, signal) {
  const r = await fetchFn(url, { signal });
  if (!r.ok) throw new Error(`XIVAPI HTTP ${r.status}`);
  return r.json();
}

/** All FishParameter rows we need: parallel windows, then keep paging while pages still hold Fish Guide rows. */
async function fetchFishParameterRows(fetchFn, signal) {
  const pages = await Promise.all(Array.from({ length: WINDOWS }, (_, i) => getJson(pageUrl(i * PAGE - 1), fetchFn, signal)));
  const byId = new Map();
  for (const p of pages) for (const r of p.rows) byId.set(r.row_id, r);
  let last = pages.at(-1);
  while (last.rows.length === PAGE && last.rows.some(r => r.fields.IsInLog)) {
    last = await getJson(pageUrl(last.rows.at(-1).row_id), fetchFn, signal);
    for (const r of last.rows) byId.set(r.row_id, r);
  }
  return { rows: [...byId.values()], version: pages[0].version };
}

/** All SpearfishingItem rows (≈320 today, so normally one page; keeps paging if it ever grows). */
async function fetchSpearfishingRows(fetchFn, signal) {
  const rows = [];
  for (let after = -1; ;) {
    const p = await getJson(pageUrl(after, "SpearfishingItem", SPEAR_FIELDS), fetchFn, signal);
    rows.push(...p.rows);
    if (p.rows.length < PAGE) return rows;
    after = p.rows.at(-1).row_id;
  }
}

/** Game patch name (e.g. "7.58") for an XIVAPI data version key, from the /version list; null if unknown. */
const patchName = (versions, key) => versions?.find(v => v.key === key)?.names.find(n => n !== "latest") ?? null;

/**
 * The game's log order: sort by the game's sort key, then row. The key is per expansion (2000 A Realm Reborn,
 * 3000 Heavensward … 7000 Dawntrail); ocean-fishing fish are numbered after their expansion's fish (5001…,
 * 6001…, 7001…). FishParameter uses Unknown1, SpearfishingItem uses Unknown2. A fish added to an older
 * expansion in a later patch therefore lands with that expansion, as in game. For the Fish Guide this is
 * identical to the FFXIV Fish Tracker's order (all 1,517 fish checked, patch 7.58).
 */
export function logOrder(rows, key = "Unknown1") {
  return [...rows].sort((a, b) => (a.fields[key] ?? 0) - (b.fields[key] ?? 0) || a.row_id - b.row_id);
}

// Earliest expansion each region belongs to (0 = A Realm Reborn … 5 = Dawntrail). Expansion comes from the fish's
// level band, raised to its region's expansion when that is later (e.g. level-80 fish in The Northern Empty are
// Endwalker, not Shadowbringers). Unknown regions use level alone.
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
/** Spearfish expansion from the sort key's bucket (4000 = Stormblood → 2); level/region rule if out of range. */
function spearExpansion(row, level, region) {
  const bucket = Math.floor((row.fields.Unknown2 ?? 0) / 1000) - 2;
  return bucket >= 0 && bucket <= 5 ? bucket : expansionOf(level, region);
}

// Read a nested XIVAPI field: f(row, "Item", "Name") → row.fields.Item.fields.Name
const f = (node, ...path) => path.reduce((v, k) => v?.fields?.[k], node);
const inLog = rows => rows.filter(r => r.fields.IsInLog && f(r, "Item")?.value > 0);

/** Build the compact dataset from FishParameter rows (and SpearfishingItem rows, if given). */
export function buildDataset(fishParameterRows, meta, spearfishingRows = []) {
  const tables = { rec: [], reg: [], zone: [] };
  const idx = (t, v) => {
    let i = tables[t].indexOf(v);
    if (i < 0) { i = tables[t].length; tables[t].push(v); }
    return i;
  };
  // One FISH_COLUMNS row. `spot` is where the location lives; `expansion(row, level, region)` gives the category.
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
  return { source: `${XIVAPI}/sheet/FishParameter`, ...meta, columns: FISH_COLUMNS, tables, rows, spear };
}

/** Fetch both logs from XIVAPI and build the dataset. `fetchFn` lets Node and the browser share this. */
export async function loadFishFromXivapi({ fetchFn = fetch, signal } = {}) {
  const [{ rows, version }, spearRows, versions] = await Promise.all([
    fetchFishParameterRows(fetchFn, signal), fetchSpearfishingRows(fetchFn, signal),
    getJson(`${XIVAPI}/version`, fetchFn, signal).then(d => d.versions, () => null),
  ]);
  return buildDataset(rows, { fetched: new Date().toISOString().slice(0, 10), version, patch: patchName(versions, version) }, spearRows);
}
