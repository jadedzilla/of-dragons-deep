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
// Spearfishing comes from the SpearfishingItem sheet (rows with IsInLog; the spearfishing log), in row order, with
//   FishingRecordType.Addon.Text as the size class (Small/Average/Big) in place of water type,
//   SpearfishingNotebook.TerritoryType.PlaceNameRegion / PlaceName as region / zone, and
//   Unknown2 = expansion bucket (4000 Stormblood … 7000 Dawntrail).
// Requests pin the XIVAPI schema revision so field names (notably Unknown1/Unknown2) can't change under us.

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
const SPEAR_FIELDS = [
  "IsInLog", "Unknown2",
  "Item.Name", "Item.Icon", "Item.IsCollectable", "Item.Rarity",
  "GatheringItemLevel.GatheringItemLevel",
  "FishingRecordType.Addon.Text",
  "SpearfishingNotebook.TerritoryType.PlaceName.Name", "SpearfishingNotebook.TerritoryType.PlaceNameRegion.Name",
].join(",");
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

/** Build the compact dataset from FishParameter rows (and SpearfishingItem rows, if given). */
export function buildDataset(fishParameterRows, meta, spearfishingRows = []) {
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
  // Spearfishing log: row order; expansion from Unknown2 (4000 = Stormblood → 2), else level/region.
  const spear = spearfishingRows.filter(r => r.fields.IsInLog && f(r, "Item")?.value > 0)
    .sort((a, b) => a.row_id - b.row_id).map(r => {
      const level = f(r, "GatheringItemLevel", "GatheringItemLevel");
      const territory = f(r, "SpearfishingNotebook", "TerritoryType");
      const region = f(territory, "PlaceNameRegion", "Name") ?? "", zone = f(territory, "PlaceName", "Name") ?? "";
      const bucket = Math.floor((r.fields.Unknown2 ?? 0) / 1000) - 2;
      const rarity = f(r, "Item", "Rarity");
      return [
        f(r, "Item").value, f(r, "Item", "Name"), f(r, "Item", "Icon")?.id ?? 0, level,
        bucket >= 0 && bucket <= 5 ? bucket : expansionOf(level, region),
        idx("rec", f(r, "FishingRecordType", "Addon", "Text") ?? ""), idx("reg", region), idx("zone", zone),
        rarity >= 2 ? 1 : 0, f(r, "Item", "IsCollectable") ? 1 : 0, rarity,
      ];
    });
  return { source: `${XIVAPI}/sheet/FishParameter`, ...meta, columns: FISH_COLUMNS, tables, rows, spear };
}

/** Fetch the Fish Guide from XIVAPI and build the dataset. `fetchFn` lets Node and the browser share this. */
export async function loadFishFromXivapi({ fetchFn = fetch, signal } = {}) {
  const [{ rows, version }, spearRows, patch] = await Promise.all([
    fetchFishParameterRows(fetchFn, signal), fetchSpearfishingRows(fetchFn, signal),
    getJson(`${XIVAPI}/version`, fetchFn, signal).then(({ versions }) => versions, () => null),
  ]);
  const patchNameFor = key => patch?.find(v => v.key === key)?.names.find(n => n !== "latest") ?? null;
  return buildDataset(rows, { fetched: new Date().toISOString().slice(0, 10), version, patch: patchNameFor(version) }, spearRows);
}
