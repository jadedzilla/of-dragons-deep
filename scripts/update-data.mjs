#!/usr/bin/env node
// Refreshes the game data in src/data/ from XIVAPI and FFXIV Teamcraft and reports what changed. Runs before every
// production build (npm run build) and on its own with npm run data. A file is only rewritten when its content
// changed; if a source can't be reached, its committed file is kept and the build carries on with it.
// Hand-kept files (rules.json, delivery-fish.json) are never touched.
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fetchFish } from "./data/fish.mjs";
import { fetchTeamcraft } from "./data/teamcraft.mjs";
import { fetchSpots } from "./data/spots.mjs";
import { fetchItems, fetchDescriptions } from "./data/items.mjs";
import { fetchAchievements, fetchOcean } from "./data/achievements.mjs";
import { fetchBaits } from "./data/baits.mjs";

// behind a proxy, Node's fetch only uses it with NODE_USE_ENV_PROXY (Node ≥ 22.21): run again with it set
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1", NODE_NO_WARNINGS: "1" } });
  process.exit(r.status ?? 1);
}

const dataDir = new URL("../src/data/", import.meta.url);
const readData = async name => JSON.parse(await readFile(new URL(name, dataDir), "utf8"));
const t0 = Date.now();
let failed = 0;

/** Compares a dataset with its committed file and writes it if it changed. Returns the data in use. */
async function update(name, fetcher, describe = () => "") {
  const file = new URL(name, dataDir);
  const old = await readFile(file, "utf8").catch(() => null);
  let data;
  try {
    data = await fetcher();
  } catch (e) {
    failed++;
    console.warn(`  ${name}: couldn't update (${e.message}); keeping the committed file`);
    return old && JSON.parse(old);
  }
  const body = JSON.stringify(data) + "\n";
  if (body === old) console.log(`  ${name}: up to date`);
  else {
    await writeFile(file, body);
    console.log(`  ${name}: updated (${(body.length / 1024).toFixed(0)} KB)${describe(old && JSON.parse(old), data)}`);
  }
  return data;
}

const count = x => Object.keys(x ?? {}).length;
const keyDiff = (label, a = {}, b = {}) => {
  const added = count(b) - count(a);
  return added ? `, ${added > 0 ? "+" : ""}${added} ${label}` : "";
};
const fishDiff = (old, now) => {
  const ids = d => new Set([...(d?.rows ?? []), ...(d?.spear ?? [])].map(r => r[0]));
  const before = ids(old), after = ids(now);
  const added = [...now.rows, ...now.spear].filter(r => !before.has(r[0])).map(r => r[1]);
  const removed = [...(old?.rows ?? []), ...(old?.spear ?? [])].filter(r => !after.has(r[0])).map(r => r[1]);
  return `: ${now.rows.length} fish, ${now.spear.length} spearfish, patch ${now.patch ?? "?"}`
    + (old?.patch && old.patch !== now.patch ? ` (was ${old.patch})` : "")
    + (added.length ? `\n    new: ${added.join(", ")}` : "") + (removed.length ? `\n    gone: ${removed.join(", ")}` : "");
};

console.log("Updating game data from XIVAPI and FFXIV Teamcraft …");
const [fish, teamcraft] = await Promise.all([
  update("fish.json", fetchFish, fishDiff),
  update("teamcraft.json", fetchTeamcraft, (o, n) => keyDiff("fish with sources", o?.["fishing-sources"], n["fishing-sources"])),
]);
await Promise.all([
  update("spots.json", () => fetchSpots(teamcraft), (o, n) => keyDiff("spots", o?.spots, n.spots)),
  update("items.json", () => fetchItems(teamcraft), (o, n) => keyDiff("items", o, n)),
  update("descriptions.json", () => fetchDescriptions(fish), (o, n) => keyDiff("descriptions", o, n)),
  update("achievements.json", fetchAchievements, (o, n) => keyDiff("achievements", o?.achievements, n.achievements)),
  update("ocean.json", fetchOcean, (o, n) => keyDiff("routes", o?.routes, n.routes)),
  update("baits.json", fetchBaits, (o, n) => keyDiff("baits", o?.baits, n.baits)),
]);

// fish icons live in sprite sheets made by npm run fetch:icons (needs Chromium); until then the app loads new ones from XIVAPI
const icons = (await readData("icons.json")).icons;
const missing = [...new Set([...fish.rows, ...fish.spear].map(r => r[2]).filter(id => id && !(id in icons)))];
if (missing.length) console.log(`  icons: ${missing.length} fish icon(s) not in the sprite sheets yet; run npm run fetch:icons`);

console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)} s${failed ? `; ${failed} source(s) unreachable, their committed files are used` : ""}.`);
