#!/usr/bin/env node
// Refreshes the committed fallback snapshot, data/fish.json, from XIVAPI (FishParameter sheet = the Fish Guide).
// The app loads the same data live in the browser; this snapshot is only used when that fails
// (offline, blocked network, or XIVAPI is down). Loading is shared with the browser: src/fishsource.js.
// Requires Node 18+ (built-in fetch) and network access to v2.xivapi.com. Usage: npm run fetch-data
import { writeFile, mkdir } from "node:fs/promises";
import { loadFishFromXivapi } from "../src/fishsource.js";

const OUT = new URL("../data/fish.json", import.meta.url);

console.log("Downloading the Fish Guide from XIVAPI …");
const dataset = await loadFishFromXivapi();
if (!dataset.rows.length) throw new Error("XIVAPI returned no fish");
await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(dataset));
console.log(`Wrote data/fish.json: ${dataset.rows.length} fish (${dataset.rows.filter(r => r[8]).length} big fish), patch ${dataset.patch ?? "?"}, ${dataset.fetched}`);
