// Fisher achievements (XIVAPI Achievement rows in AchievementCategory 34) and their progress.
// Requirements: Type 1 = counter Key reaches Data[0]; Type 2 = all of the achievements Key + Data[]; Type 27 = every
// fish at an ocean fishing stop. Counters worked out from caught fish (the top tiers equal these totals exactly):
//   202 unique fish (Fish Guide + spearfishing) · 267 big fish ARR+HW+SB · 826 ShB · 1000 EW · 1145 DT
import { XIVAPI, SCHEMA_PARAM, getJson, xivAsset } from "./xivapi.js";

const FISHER_CATEGORY = 34;
const UNIQUE_FISH = 202;
const BIG_FISH_COUNTERS = { 267: [0, 1, 2], 826: [3], 1000: [4], 1145: [5] }; // counter → categories

const refValue = v => (v && typeof v === "object" ? v.value ?? v.row_id : v);

/** { achievements: [{ id, name, desc, points, icon, order, type, key, data }], oceanSpots: [{ names, main, sub }] }. */
export async function loadAchievements({ fetchFn = fetch, signal } = {}) {
  const opts = { fetchFn, signal }, results = [];
  // @as(raw): plain numbers; without it Key/Data expand the linked rows (~250 KB instead of ~50 KB)
  let page = await getJson(`${XIVAPI}/search?sheets=Achievement&query=${encodeURIComponent(`AchievementCategory=${FISHER_CATEGORY}`)}`
    + `&limit=500&fields=Name,Description,Points,Type@as(raw),Key@as(raw),Data@as(raw),Order,Icon&${SCHEMA_PARAM}`, opts);
  results.push(...page.results);
  while (page.next) {
    page = await getJson(`${XIVAPI}/search?cursor=${encodeURIComponent(page.next)}&limit=500`, opts);
    results.push(...page.results);
  }

  const spots = await getJson(`${XIVAPI}/sheet/IKDSpot?limit=500&fields=PlaceName.Name,SpotMain.PlaceName.Name,SpotMain.Item[].Name,SpotSub.Item[].Name&${SCHEMA_PARAM}`, opts);
  const fishOf = spot => (spot?.fields?.Item ?? []).map(i => i.row_id).filter(id => id > 0);
  const oceanSpots = spots.rows.filter(r => r.row_id > 0).map(r => ({
    // as the descriptions spell them: "outer Galadion Bay", "the Ruby Sea" → lower case, no leading "the"
    names: [r.fields.PlaceName?.fields?.Name, r.fields.SpotMain?.fields?.PlaceName?.fields?.Name]
      .filter(Boolean).map(n => n.toLowerCase().replace(/^the /, "")),
    main: fishOf(r.fields.SpotMain), sub: fishOf(r.fields.SpotSub),
  }));

  const achievements = results.map(({ row_id, fields: f }) => ({
    id: row_id, name: f.Name, desc: f.Description, points: f.Points, order: f.Order,
    type: refValue(f["Type@as(raw)"] ?? f.Type), key: refValue(f["Key@as(raw)"] ?? f.Key),
    data: (f["Data@as(raw)"] ?? f.Data ?? []).map(refValue).filter(v => v > 0),
    icon: f.Icon?.path_hr1 ? xivAsset(f.Icon.path_hr1) : f.Icon?.path ? xivAsset(f.Icon.path) : null,
  })).sort((a, b) => a.order - b.order || a.id - b.id);
  return { achievements, oceanSpots };
}

let cached = null; // loaded once; dropped on failure so it's retried
export function getAchievements() {
  cached ??= loadAchievements().catch(e => { cached = null; throw e; });
  return cached;
}

/** The ocean stop a description names (longest match wins), or null. */
function oceanSpotFor(desc, oceanSpots) {
  const d = desc.toLowerCase();
  let best = null, bestLen = 0;
  for (const s of oceanSpots) for (const n of s.names) if (n.length > bestLen && d.includes(n)) { best = s; bestLen = n.length; }
  return best;
}

/**
 * What an achievement needs: { kind: "count", section, need, fish } (any `need` of them), { kind: "set", section, fish }
 * (all of them), { kind: "meta", ids } (all those achievements) or { kind: "manual", section }.
 */
export function requirement(a, oceanSpots, allFish, byId) {
  if (a.type === 1 && a.key === UNIQUE_FISH) return { kind: "count", section: "log", need: a.data[0], fish: allFish };
  if (a.type === 1 && BIG_FISH_COUNTERS[a.key]) {
    const cats = BIG_FISH_COUNTERS[a.key];
    return { kind: "count", section: "big", need: a.data[0], fish: allFish.filter(f => !f.spear && f.big && cats.includes(f.cat)) };
  }
  if (a.type === 27) {
    const spot = oceanSpotFor(a.desc, oceanSpots);
    if (spot) {
      const ids = /current is present/i.test(a.desc) ? spot.sub : spot.main;
      return { kind: "set", section: "ocean", fish: ids.map(id => byId.get(id)).filter(Boolean) };
    }
  }
  if (a.type === 2) return { kind: "meta", ids: [a.key, ...a.data] };
  return { kind: "manual", section: /ocean fishing/i.test(a.desc) ? "ocean" : a.order < 40 ? "milestones" : "other" };
}

/**
 * Everything the pages need about progress, worked out once per change of data, caught fish or marks:
 * { reqs, byId, isDone(a), caughtOf(r), fraction(a), progressLabel(a) }.
 */
export function achievementState({ achievements, oceanSpots }, { allFish, fishById, isCaught, marks, progress }) {
  const reqs = new Map(achievements.map(a => [a.id, requirement(a, oceanSpots, allFish, fishById)]));
  const byId = new Map(achievements.map(a => [a.id, a]));
  const caughtOf = r => r.fish.filter(f => isCaught(f.id)).length;
  const done = new Map();
  const isDone = (a, seen = new Set()) => {
    if (done.has(a.id)) return done.get(a.id);
    const r = reqs.get(a.id);
    let v;
    if (marks.has(a.id)) v = true; // ticked by hand, or complete in game (import)
    else if (r.kind === "count") v = caughtOf(r) >= r.need;
    else if (r.kind === "set") v = r.fish.length > 0 && r.fish.every(f => isCaught(f.id));
    else if (r.kind === "meta") {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      v = r.ids.every(id => byId.has(id) ? isDone(byId.get(id), seen) : marks.has(id));
    } else v = false;
    done.set(a.id, v);
    return v;
  };
  const partsDone = r => r.ids.filter(id => byId.has(id) ? isDone(byId.get(id)) : marks.has(id)).length;
  /** How far along (0–1): caught fish, parts done, or the game's progress from the last import. */
  const fraction = a => {
    const r = reqs.get(a.id);
    if (r.kind === "count") return Math.min(1, caughtOf(r) / r.need);
    if (r.kind === "set") return caughtOf(r) / r.fish.length;
    if (r.kind === "meta") return partsDone(r) / r.ids.length;
    const p = progress.items[a.id];
    return p && p[1] ? Math.min(1, p[0] / p[1]) : 0;
  };
  return { reqs, byId, isDone, caughtOf, partsDone, fraction };
}

export const SECTIONS = [
  ["log", "Fish log", "Tracked from the fish you've marked caught (Fish Guide and spearfishing log)."],
  ["big", "Big fish", "Tracked from the big fish you've marked caught."],
  ["ocean", "Ocean Fishing", "Spot achievements (Denizens/Specters) are tracked from the ocean fish you've marked caught; voyage scores and bonuses aren't, so mark those obtained yourself."],
  ["milestones", "Fishing milestones", "The app can't count casts, so mark these obtained yourself."],
  ["other", "Other", "Not tracked, so mark these obtained yourself."],
];
