#!/usr/bin/env node
// Downloads fish data from the FFXIV Fish Tracker (ff14fish.carbuncleplushy.com) and writes data/fish.json.
//
//   fish_info_data.js  → `const FISH_INFO = [ ...JSON... ];`  names, icons, levels, zones (1,500+ fish)
//   data.js            → `const DATA = { FISH: { ...JSON... }, ... }`  big-fish flags + patch numbers
//
// The files are parsed as text (the JSON blocks are extracted and JSON.parse'd); the tracker's code is never run.
// Requires Node 18+ (built-in fetch). Usage: npm run fetch-data

import { writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const BASE = "https://ff14fish.carbuncleplushy.com/js/app/";
const OUT = new URL("../data/fish.json", import.meta.url);

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

/** Expansion index from patch number (2.x = ARR … 7.x = Dawntrail), falling back to fish level. */
function expansionOf(info, extra) {
  if (extra?.patch) return Math.min(5, Math.max(0, Math.floor(extra.patch) - 2));
  const l = info.level[0];
  return l <= 50 ? 0 : l <= 60 ? 1 : l <= 70 ? 2 : l <= 80 ? 3 : l <= 90 ? 4 : 5;
}

/** Build the compact {tables, rows} structure the app reads. */
export function buildDataset(fishInfo, fishExtra) {
  const tables = { rec: [], reg: [], zone: [] };
  const idx = (t, v) => {
    let i = tables[t].indexOf(v);
    if (i < 0) { i = tables[t].length; tables[t].push(v); }
    return i;
  };
  const rows = fishInfo.map(x => {
    const d = fishExtra[x.id];
    return [
      x.id, x.name_en, +x.icon, x.level[0], expansionOf(x, d),
      idx("rec", x.record_en), idx("reg", x.region_en), idx("zone", x.zone_en),
      d?.bigFish ? 1 : 0, x.collectable ? 1 : 0, x.rarity,
    ];
  });
  return {
    source: [BASE + "fish_info_data.js", BASE + "data.js"],
    fetched: new Date().toISOString().slice(0, 10),
    columns: ["id", "name", "icon", "level", "expansion", "water", "region", "zone", "bigFish", "collectable", "rarity"],
    tables,
    rows,
  };
}

async function get(file) {
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.text();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log("Downloading fish data…");
  const [infoText, dataText] = await Promise.all([get("fish_info_data.js"), get("data.js")]);
  const fishInfo = JSON.parse(extractBlock(infoText, "const FISH_INFO = ["));
  const fishExtra = JSON.parse(extractBlock(dataText, "FISH: {"));
  const dataset = buildDataset(fishInfo, fishExtra);
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(dataset));
  const big = dataset.rows.filter(r => r[8]).length;
  console.log(`Wrote data/fish.json: ${dataset.rows.length} fish (${big} big fish), ${dataset.fetched}`);
}
