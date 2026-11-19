// Where to get each bait (vendors, crafting): src/data/baits.json (scripts/update-data.mjs), loaded on first use.
let data = null;
export function loadBaitData() {
  data ??= import("../data/baits.json", { with: { type: "json" } }).then(m => m.default).catch(e => { data = null; throw e; });
  return data;
}
export const VENDORS_SHOWN = 6;
