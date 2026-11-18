#!/usr/bin/env node
// Re-records the network the tests serve instead of the internet: `npm run fixtures` (needs v2.xivapi.com and
// raw.githubusercontent.com; behind a proxy on Node ≥ 22.21 run with NODE_USE_ENV_PROXY=1).
// Runs the app's own loaders with a recording fetch, so the URLs always match what the app asks for.
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { XIVAPI, SCHEMA_PARAM, xivRows } from "../../src/lib/xivapi.js";
import { loadFishFromXivapi } from "../../src/lib/fishSource.js";
import { baitChains, loadTeamcraft } from "../../src/lib/teamcraft.js";
import { loadTimerData } from "../../src/lib/timers.js";
import { loadAchievements } from "../../src/lib/achievements.js";
import { loadOceanRoutes } from "../../src/lib/logRoute.js";
import { canonical } from "./network.js";

const exact = {};
const recordingFetch = async (url, opts) => {
  const res = await fetch(url, opts);
  if (res.ok) exact[canonical(url)] = await res.clone().json();
  return res;
};
const step = async (name, fn) => { process.stdout.write(`${name}… `); await fn(); console.log("ok"); };
const t0 = Date.now();

await step("Fish Guide, spearfishing, aquarium", () => loadFishFromXivapi({ fetchFn: recordingFetch }));
await step("Teamcraft", () => Promise.all(["fishing-sources", "spearfishing-sources", "fishing-spots"].map(f => loadTeamcraft(f, recordingFetch))));
await step("Catch windows and weather", () => loadTimerData({ fetchFn: recordingFetch }));
await step("Achievements", () => loadAchievements({ fetchFn: recordingFetch }));
await step("Ocean voyages", () => loadOceanRoutes({ fetchFn: recordingFetch }));

// every row the pages could look up for what's on screen (spot names, bait and mooch items, weather)
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

// descriptions for the fish the tests open (others answer 404: "Description unavailable")
await step("Item descriptions", () => Promise.all([4776, 4869, 4904, 28937, 20144].map(id =>
  recordingFetch(`${XIVAPI}/sheet/Item/${id}?fields=Description&${SCHEMA_PARAM}`))));

const body = gzipSync(JSON.stringify({ recordedAt: new Date().toISOString(), exact, tables }), { level: 9 });
await writeFile(new URL("./network.json.gz", import.meta.url), body);
console.log(`Wrote tests/fixtures/network.json.gz (${Object.keys(exact).length} responses, ${(body.length / 1024).toFixed(0)} KB) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
