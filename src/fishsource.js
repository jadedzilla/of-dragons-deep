// Loads the Fish Guide from XIVAPI (game data) into the compact {tables, rows} dataset the app reads.
// Shared by the browser (live load in src/data.js) and scripts/fetch-fish-data.mjs (committed snapshot).
// Replaced the FFXIV Fish Tracker (ff14fish.carbuncleplushy.com) as the source; output was verified identical.
//
// Source: the FishParameter sheet. Rows with IsInLog are exactly the Fish Guide entries. For each one we read:
//   Item.Name / Item.Icon / Item.IsCollectable / Item.Rarity    name, icon id, collectable, rarity (≥2 = big fish)
//   GatheringItemLevel.GatheringItemLevel                       level
//   FishingRecordType.Addon.Text                                water type (Coastlines, Rivers, …)
//   FishingSpot.TerritoryType.PlaceNameRegion / PlaceName       region / zone
//   Unknown1                                                    ocean-fishing guide number (see fishGuideOrder)
// Requests pin the XIVAPI schema revision so field names (notably Unknown1) can't change under us.

export const XIVAPI = "https://v2.xivapi.com/api";
export const XIVAPI_SCHEMA = "exdschema@2:rev:e773c41a90aed788cf4c1c48469fa85618ef01fb";
export const FISH_COLUMNS = ["id", "name", "icon", "level", "expansion", "water", "region", "zone", "bigFish", "collectable", "rarity"];

const FIELDS = [
  "IsInLog", "Unknown1",
  "Item.Name", "Item.Icon", "Item.IsCollectable", "Item.Rarity",
  "GatheringItemLevel.GatheringItemLevel",
  "FishingRecordType.Addon.Text",
  "FishingSpot.TerritoryType.PlaceName.Name", "FishingSpot.TerritoryType.PlaceNameRegion.Name",
].join(",");
const PAGE = 500;          // XIVAPI's maximum page size
const WINDOWS = 4;         // pages fetched in parallel up front (the Fish Guide is rows 1…~1520)

const pageUrl = after => `${XIVAPI}/sheet/FishParameter?limit=${PAGE}&schema=${encodeURIComponent(XIVAPI_SCHEMA)}`
  + `&fields=${FIELDS}` + (after >= 0 ? `&after=${after}` : "");

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

/** Game patch name (e.g. "7.58") for an XIVAPI data version key; null if it can't be found. */
async function patchName(versionKey, fetchFn, signal) {
  try {
    const { versions } = await getJson(`${XIVAPI}/version`, fetchFn, signal);
    return versions.find(v => v.key === versionKey)?.names.find(n => n !== "latest") ?? null;
  } catch { return null; }
}

/**
 * Fish Guide order: FishParameter row order, except that ocean-fishing fish carry their own guide numbers in
 * Unknown1 (e.g. 7001, 7002, …; ordinary fish have round values like 2000, 3000 per expansion). Those fish are
 * reordered by that number within the positions they occupy. This reproduces the FFXIV Fish Tracker's Fish Guide
 * order exactly (checked for all 1,517 fish when switching sources).
 */
export function fishGuideOrder(rows) {
  const sorted = [...rows].sort((a, b) => a.row_id - b.row_id);
  const numbered = r => r.fields.Unknown1 % 1000 !== 0;
  const queue = sorted.filter(numbered).sort((a, b) => a.fields.Unknown1 - b.fields.Unknown1 || a.row_id - b.row_id);
  let q = 0;
  return sorted.map(r => numbered(r) ? queue[q++] : r);
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

// Read a nested XIVAPI field: f(row, "Item", "Name") → row.fields.Item.fields.Name
const f = (node, ...path) => path.reduce((v, k) => v?.fields?.[k], node);

/** Build the compact dataset from FishParameter rows. */
export function buildDataset(fishParameterRows, meta) {
  const tables = { rec: [], reg: [], zone: [] };
  const idx = (t, v) => {
    let i = tables[t].indexOf(v);
    if (i < 0) { i = tables[t].length; tables[t].push(v); }
    return i;
  };
  const guide = fishParameterRows.filter(r => r.fields.IsInLog && f(r, "Item")?.value > 0);
  const rows = fishGuideOrder(guide).map(r => {
    const level = f(r, "GatheringItemLevel", "GatheringItemLevel");
    const territory = f(r, "FishingSpot", "TerritoryType");
    const region = f(territory, "PlaceNameRegion", "Name") ?? "", zone = f(territory, "PlaceName", "Name") ?? "";
    const rarity = f(r, "Item", "Rarity");
    return [
      f(r, "Item").value, f(r, "Item", "Name"), f(r, "Item", "Icon")?.id ?? 0, level, expansionOf(level, region),
      idx("rec", f(r, "FishingRecordType", "Addon", "Text") ?? ""), idx("reg", region), idx("zone", zone),
      rarity >= 2 ? 1 : 0, f(r, "Item", "IsCollectable") ? 1 : 0, rarity,
    ];
  });
  return { source: `${XIVAPI}/sheet/FishParameter`, ...meta, columns: FISH_COLUMNS, tables, rows };
}

/** Fetch the Fish Guide from XIVAPI and build the dataset. `fetchFn` lets Node and the browser share this. */
export async function loadFishFromXivapi({ fetchFn = fetch, signal } = {}) {
  const { rows, version } = await fetchFishParameterRows(fetchFn, signal);
  const patch = await patchName(version, fetchFn, signal);
  return buildDataset(rows, { fetched: new Date().toISOString().slice(0, 10), version, patch });
}
