// src/data/teamcraft.json: FFXIV Teamcraft's fishing data (github.com/ffxiv-teamcraft/ffxiv-teamcraft, staging branch):
//   "fishing-sources"       { itemId: [{ spot, bait, hookset, tug, spawn?, duration?, weathers?, weathersFrom?, … }] }
//   "spearfishing-sources"  { itemId: [{ spawn?, duration?, … }] }
//   "fishing-spots"         [{ id (FishingSpot), zoneId (PlaceName) }]   (trimmed to what the app uses)
import { getJson } from "./xivapi.mjs";

export const TEAMCRAFT_DATA = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

export async function fetchTeamcraft() {
  const [fishing, spear, spots] = await Promise.all(["fishing-sources", "spearfishing-sources", "fishing-spots"]
    .map(name => getJson(`${TEAMCRAFT_DATA}/${name}.json`)));
  if (Object.keys(fishing).length < 1000) throw new Error("Teamcraft fishing-sources looks empty");
  return {
    "fishing-sources": fishing,
    "spearfishing-sources": spear,
    "fishing-spots": spots.map(s => ({ id: s.id, zoneId: s.zoneId })),
  };
}
