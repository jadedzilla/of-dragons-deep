// Loads data/fish.json (written by scripts/fetch-fish-data.mjs) and decodes the compact rows into fish objects.
// In the single-file build, scripts/build.mjs inlines the JSON as window.__FISH_DATA__ instead.

export const CATEGORIES = ["A Realm Reborn", "Heavensward", "Stormblood", "Shadowbringers", "Endwalker", "Dawntrail", "Ocean Fishing"];
export const OCEAN_FISHING = 6;

export async function loadFish() {
  const raw = window.__FISH_DATA__ ?? await fetch("data/fish.json").then(r => {
    if (!r.ok) throw new Error(`Could not load data/fish.json (${r.status})`);
    return r.json();
  });
  const { tables: T, rows } = raw;
  const oceanRegion = T.reg.indexOf("The High Seas");
  const fish = rows.map(([id, name, icon, lvl, exp, water, region, zone, big, collectable, rarity]) => ({
    id,
    name: name.trim(),
    icon,                                      // game icon id, e.g. 29063 → icon 029063 (not rendered yet)
    lvl,
    cat: region === oceanRegion ? OCEAN_FISHING : exp,
    water: T.rec[water],
    region: T.reg[region],
    zone: T.zone[zone],
    big: big === 1 || rarity >= 2,             // tracker's big-fish flag, or rare (covers ocean-fishing rares)
    collectable: collectable === 1,
  }));
  return { fish, fetched: raw.fetched };
}
