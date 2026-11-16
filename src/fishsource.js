// Parses the FFXIV Fish Tracker's fish_info_data.js into the compact {tables, rows} dataset the app reads.
// Shared by the browser (live fetch in src/data.js) and scripts/fetch-fish-data.mjs (committed snapshot).
// The source is parsed as text (the JSON array is extracted and JSON.parse'd); the tracker's code is never run.

export const FISH_SOURCE_URL = "https://ff14fish.carbuncleplushy.com/js/app/fish_info_data.js";
export const FISH_COLUMNS = ["id", "name", "icon", "level", "expansion", "water", "region", "zone", "bigFish", "collectable", "rarity"];

/** Return the balanced {...} or [...] block that starts at the end of `marker`, respecting JSON strings. */
export function extractBlock(text, marker) {
  const i = text.indexOf(marker);
  if (i < 0) throw new Error(`Marker not found: ${marker}`);
  const open = marker.trim().slice(-1);
  const close = open === "{" ? "}" : "]";
  const start = text.indexOf(open, i + marker.length - 1);
  let depth = 0, inStr = false, esc = false;
  for (let k = start; k < text.length; k++) {
    const c = text[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return text.slice(start, k + 1);
  }
  throw new Error(`Unbalanced block after: ${marker}`);
}

// Earliest expansion each region belongs to (0 = A Realm Reborn … 5 = Dawntrail). fish_info_data.js has no patch
// numbers, so expansion comes from the fish's level band, raised to its region's expansion when that is later
// (e.g. level-80 fish in The Northern Empty are Endwalker, not Shadowbringers). Unknown regions use level alone.
const REGION_EXPANSION = {
  "Dravania": 1, "Abalathia's Spine": 1,
  "Gyr Abania": 2, "Othard": 2, "Hingashi": 2,
  "Norvrandt": 3,
  "The Northern Empty": 4, "Ilsabard": 4, "The Sea of Stars": 4, "The World Unsundered": 4,
  "Yok Tural": 5, "Xak Tural": 5, "Unlost World": 5,
};

function expansionOf(info) {
  const l = info.level[0];
  const byLevel = l <= 50 ? 0 : l <= 60 ? 1 : l <= 70 ? 2 : l <= 80 ? 3 : l <= 90 ? 4 : 5;
  return Math.max(byLevel, REGION_EXPANSION[info.region_en] ?? 0);
}

/** Build the compact dataset from the FISH_INFO array. */
export function buildDataset(fishInfo, fetched) {
  const tables = { rec: [], reg: [], zone: [] };
  const idx = (t, v) => {
    let i = tables[t].indexOf(v);
    if (i < 0) { i = tables[t].length; tables[t].push(v); }
    return i;
  };
  const rows = fishInfo.map(x => [
    x.id, x.name_en, +x.icon, x.level[0], expansionOf(x),
    idx("rec", x.record_en), idx("reg", x.region_en), idx("zone", x.zone_en),
    x.rarity >= 2 ? 1 : 0, x.collectable ? 1 : 0, x.rarity,
  ]);
  return { source: FISH_SOURCE_URL, fetched, columns: FISH_COLUMNS, tables, rows };
}

/** Parse the text of fish_info_data.js into the compact dataset. */
export function parseFishInfo(text, fetched) {
  return buildDataset(JSON.parse(extractBlock(text, "const FISH_INFO = [")), fetched);
}
