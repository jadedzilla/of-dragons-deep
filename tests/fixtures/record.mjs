#!/usr/bin/env node
// Re-records the network data the tests serve instead of the internet: `npm run test:record`
// (needs network access to v2.xivapi.com and raw.githubusercontent.com; behind a proxy on Node ≥ 22.21 run with
// NODE_USE_ENV_PROXY=1). Writes tests/fixtures/network.json.gz:
//   exact:  { canonical URL → JSON body }   every request the app's loaders make (recorded by running them)
//   tables: { sheet → [rows] }              XIVAPI rows the app asks for by `?rows=` depending on what's on screen
//                                           (spot names/zones/weather, bait/mooch item names, ocean weathers)
// The URLs are recorded by running the app's own loaders with a recording fetch, so they always match.
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { XIVAPI, XIVAPI_SCHEMA, loadFishFromXivapi } from "../../src/fishsource.js";
import { loadTeamcraft, xivRows, baitChains } from "../../src/teamcraft.js";
import { loadTimerData } from "../../src/timers.js";
import { loadAchievements } from "../../src/achievements.js";
import { canonical } from "../lib/canonical.mjs";

const exact = {};
const realFetch = globalThis.fetch;
const recordingFetch = async (url, opts) => {
  const res = await realFetch(url, opts);
  if (res.ok) exact[canonical(url)] = await res.clone().json();
  return res;
};

const t0 = Date.now();
const step = async (name, fn) => { process.stdout.write(`${name}… `); await fn(); console.log("ok"); };

await step("Fish Guide + spearfishing + aquarium (XIVAPI)", () => loadFishFromXivapi({ fetchFn: recordingFetch }));
await step("Teamcraft fishing data", async () => {
  for (const f of ["fishing-sources", "spearfishing-sources", "fishing-spots"]) await loadTeamcraft(f, recordingFetch);
});
await step("Timer windows + zone weather", () => loadTimerData({ fetchFn: recordingFetch }));
await step("Achievements + ocean stops", () => loadAchievements({ fetchFn: recordingFetch }));
await step("Ocean voyages", async () => {
  globalThis.fetch = recordingFetch; // loadOceanRoutes uses the global fetch
  try { await (await import("../../src/logroute.js")).loadOceanRoutes(); } finally { globalThis.fetch = realFetch; }
});

// Rows the pages look up by id for whatever is on screen: record every row they could ask for.
const sources = await loadTeamcraft("fishing-sources");
const spots = new Set(), items = new Set(), weathers = new Set();
for (const [id, entries] of Object.entries(sources)) {
  for (const e of entries) {
    spots.add(e.spot);
    for (const p of e.predators ?? []) items.add(p.id);
    for (const w of e.weathers ?? []) weathers.add(w);
  }
  items.add(+id);
  for (const g of baitChains(sources, +id)) for (const c of g.chains) c.forEach(i => items.add(i));
}
const tables = {};
await step("Spot, item and weather rows", async () => {
  tables.FishingSpot = await xivRows("FishingSpot", [...spots], ["PlaceName.Name", "TerritoryType.PlaceName.Name",
    ...["Weather[].Name", "Weather[].Icon", "Rate"].map(f => "TerritoryType.WeatherRate." + f)].join(","));
  tables.Item = await xivRows("Item", [...items], "Name,Icon");
  tables.Weather = await xivRows("Weather", [...weathers], "Name,Icon");
});

// Item descriptions for the fish the tests open in the fish view (others answer 404 → "Description unavailable").
const DESCRIBED = [4776, 4869, 4904, 28937, 20144];
await step("Item descriptions", async () => {
  for (const id of DESCRIBED) await recordingFetch(`${XIVAPI}/sheet/Item/${id}?fields=Description&schema=${encodeURIComponent(XIVAPI_SCHEMA)}`);
});

const out = new URL("./network.json.gz", import.meta.url);
const body = gzipSync(JSON.stringify({ recordedAt: new Date().toISOString(), exact, tables }), { level: 9 });
await writeFile(out, body);
console.log(`Wrote tests/fixtures/network.json.gz: ${Object.keys(exact).length} responses + ${Object.values(tables).reduce((n, t) => n + t.length, 0)} rows, ${(body.length / 1024).toFixed(0)} KB, in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
