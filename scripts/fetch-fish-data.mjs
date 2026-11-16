#!/usr/bin/env node
// Refreshes the committed fallback snapshot, data/fish.json, from the FFXIV Fish Tracker's fish_info_data.js.
// The app fetches that file live in the browser; this snapshot is only used when the live fetch fails
// (offline, blocked network, or the source is down). Parsing is shared with the browser: src/fishsource.js.
// Requires Node 18+ (built-in fetch). Usage: npm run fetch-data
import { writeFile, mkdir } from "node:fs/promises";
import { FISH_SOURCE_URL, parseFishInfo } from "../src/fishsource.js";

const OUT = new URL("../data/fish.json", import.meta.url);

console.log(`Downloading ${FISH_SOURCE_URL} …`);
const res = await fetch(FISH_SOURCE_URL);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const dataset = parseFishInfo(await res.text(), new Date().toISOString().slice(0, 10));
await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(dataset));
console.log(`Wrote data/fish.json: ${dataset.rows.length} fish (${dataset.rows.filter(r => r[8]).length} big fish), ${dataset.fetched}`);
