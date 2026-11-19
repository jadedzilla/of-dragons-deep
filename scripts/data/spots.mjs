// src/data/spots.json: fishing spots and zone weather, from XIVAPI (FishingSpot / SpearfishingNotebook → TerritoryType →
// WeatherRate):
//   { spots: { spotId: [name, zone, territory] }, spear: { itemId: territory },
//     rates: { territory: [[weatherId, cumulative %]…] }, weather: { weatherId: [name, iconPath] } }
import { allRows, field, xivRows } from "./xivapi.mjs";

const RATE = ["Weather[].Name", "Weather[].Icon", "Rate"].map(x => "TerritoryType.WeatherRate." + x);

export async function fetchSpots(teamcraft) {
  const spotIds = Object.values(teamcraft["fishing-sources"]).flatMap(es => es.map(e => e.spot));
  const [spotRows, spear] = await Promise.all([
    xivRows("FishingSpot", spotIds, ["PlaceName.Name", "TerritoryType.PlaceName.Name", ...RATE].join(",")),
    allRows("SpearfishingItem", ["IsInLog", "Item@as(raw)", ...RATE.map(x => "SpearfishingNotebook." + x)].join(",")),
  ]);
  const out = { spots: {}, spear: {}, rates: {}, weather: {} };
  const territory = tt => {
    const w = tt?.fields?.WeatherRate?.fields;
    if (!tt?.row_id) return 0;
    if (w && !out.rates[tt.row_id]) {
      let cumulative = 0;
      out.rates[tt.row_id] = [];
      w.Weather.forEach((x, i) => {
        if (!(w.Rate[i] > 0)) return;
        cumulative += w.Rate[i];
        out.rates[tt.row_id].push([x.row_id, cumulative]);
        out.weather[x.row_id] ??= [x.fields?.Name ?? "", x.fields?.Icon?.path ?? ""];
      });
    }
    return tt.row_id;
  };
  for (const r of spotRows) {
    const tt = r.fields.TerritoryType;
    out.spots[r.row_id] = [field(r, "PlaceName", "Name") ?? "", field(tt, "PlaceName", "Name") ?? "", territory(tt)];
  }
  for (const r of spear.rows) if (r.fields.IsInLog) out.spear[r.fields["Item@as(raw)"]] = territory(field(r, "SpearfishingNotebook", "TerritoryType"));
  if (Object.keys(out.spots).length < 200) throw new Error("too few fishing spots");
  return out;
}
