// GatherBuddy Reborn auto-gather lists in its clipboard format (AutoGatherList.Config.ToBase64, version 6):
// base64 of gzip([6] + UTF-8 JSON). Each fish is pinned to a fishing spot (PrefferedLocations, their spelling;
// for line fishing the location id is the FishingSpot row id). Lists are imported disabled.
const CONFIG_VERSION = 6;

export async function gatherBuddyList({ name, description = "", fish }) {
  const cfg = {
    ItemIds: fish.map(f => f.id),
    Quantities: Object.fromEntries(fish.map(f => [f.id, 1])),
    PrefferedLocations: Object.fromEntries(fish.filter(f => f.spot).map(f => [f.id, f.spot])),
    EnabledItems: Object.fromEntries(fish.map(f => [f.id, true])),
    Name: name, Description: description, FolderPath: "Of Dragons Deep", Order: 0,
    Enabled: false, Fallback: false, RemoveCompletedItems: false,
  };
  const json = new TextEncoder().encode(JSON.stringify(cfg));
  const bytes = new Uint8Array(json.length + 1);
  bytes[0] = CONFIG_VERSION;
  bytes.set(json, 1);
  const gz = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  let bin = "";
  for (let i = 0; i < gz.length; i += 0x8000) bin += String.fromCharCode(...gz.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Every land step of a planned route (stops and timed fish; voyages can't be auto-gathered) as one list. */
export function routeList(steps, date = new Date()) {
  const land = steps.filter(st => st.kind === "stop" || st.kind === "timed");
  const fish = land.flatMap(st => (st.kind === "stop" ? st.fish : [st.f]).map(f => ({ id: f.id, spot: st.kind === "stop" ? st.spot : st.e.spot })));
  return gatherBuddyList({
    name: `Of Dragons Deep · Log route (${fish.length} fish)`,
    description: `Fishing log route from Of Dragons Deep, ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}: `
      + `${land.length} steps, ${fish.length} fish, each at the route's fishing spot. Ocean fishing isn't included.`,
    fish,
  });
}
