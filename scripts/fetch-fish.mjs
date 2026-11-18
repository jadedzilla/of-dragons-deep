#!/usr/bin/env node
// Refreshes the fallback snapshot src/data/fish.json from XIVAPI (used only when the live load fails).
// Usage: npm run fetch:fish (needs v2.xivapi.com; behind a proxy on Node ≥ 22.21 run with NODE_USE_ENV_PROXY=1)
import { writeFile } from "node:fs/promises";
import { loadFishFromXivapi } from "../src/lib/fishSource.js";

console.log("Downloading the Fish Guide from XIVAPI …");
const dataset = await loadFishFromXivapi();
if (!dataset.rows.length) throw new Error("XIVAPI returned no fish");
await writeFile(new URL("../src/data/fish.json", import.meta.url), JSON.stringify(dataset));
console.log(`Wrote src/data/fish.json: ${dataset.rows.length} fish (${dataset.rows.filter(r => r[8]).length} big fish), patch ${dataset.patch ?? "?"}, ${dataset.fetched}`);
