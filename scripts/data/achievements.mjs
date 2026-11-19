// src/data/achievements.json: Fisher achievements and ocean fishing stops, from XIVAPI.
//   { achievements: [{ id, name, desc, points, order, type, key, data, icon (path) }], oceanSpots: [{ names, main, sub }] }
//   ocean: { spots: [{ id, name, main, sub }] (FishingSpot ids), routes: [{ stops: [[ikdSpot, timeOfDay]…] }] }
import rules from "../../src/data/rules.json" with { type: "json" };
import { allRows, search } from "./xivapi.mjs";

const refValue = v => (v && typeof v === "object" ? v.value ?? v.row_id : v);

export async function fetchAchievements() {
  // @as(raw): plain numbers; without it Key/Data expand the linked rows (~250 KB instead of ~50 KB)
  const [results, spots] = await Promise.all([
    search("Achievement", `AchievementCategory=${rules.achievements.fisherCategory}`,
      "Name,Description,Points,Type@as(raw),Key@as(raw),Data@as(raw),Order,Icon"),
    allRows("IKDSpot", "PlaceName.Name,SpotMain.PlaceName.Name,SpotMain.Item@as(raw),SpotSub.Item@as(raw)"),
  ]);
  const fishOf = spot => (spot?.fields?.["Item@as(raw)"] ?? []).filter(id => id > 0);
  const oceanSpots = spots.rows.filter(r => r.row_id > 0).map(r => ({
    // as the descriptions spell them: "outer Galadion Bay", "the Ruby Sea" → lower case, no leading "the"
    names: [r.fields.PlaceName?.fields?.Name, r.fields.SpotMain?.fields?.PlaceName?.fields?.Name]
      .filter(Boolean).map(n => n.toLowerCase().replace(/^the /, "")),
    main: fishOf(r.fields.SpotMain), sub: fishOf(r.fields.SpotSub),
  }));
  const achievements = results.map(({ row_id, fields: f }) => ({
    id: row_id, name: f.Name, desc: f.Description, points: f.Points, order: f.Order,
    type: refValue(f["Type@as(raw)"]), key: refValue(f["Key@as(raw)"]),
    data: (f["Data@as(raw)"] ?? []).map(refValue).filter(v => v > 0),
    icon: f.Icon?.path_hr1 ?? f.Icon?.path ?? "",
  })).sort((a, b) => a.order - b.order || a.id - b.id);
  if (achievements.length < 50) throw new Error(`only ${achievements.length} Fisher achievements`);
  return { achievements, oceanSpots };
}

export async function fetchOcean() {
  const [spots, routes] = await Promise.all([
    allRows("IKDSpot", "PlaceName.Name,SpotMain@as(raw),SpotSub@as(raw)"),
    allRows("IKDRoute", "Spot@as(raw),Time[].TimeOfDay"),
  ]);
  return {
    spots: spots.rows.filter(r => r.row_id > 0).map(r => ({ id: r.row_id, name: r.fields.PlaceName?.fields?.Name ?? "",
      main: r.fields["SpotMain@as(raw)"], sub: r.fields["SpotSub@as(raw)"] })),
    routes: routes.rows.filter(r => r.row_id > 0).map(r => ({
      stops: r.fields["Spot@as(raw)"].map((s, i) => [s, r.fields.Time[i]?.fields?.TimeOfDay]).filter(([s]) => s > 0) })),
  };
}
