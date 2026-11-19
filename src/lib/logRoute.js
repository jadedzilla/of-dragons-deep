// The Log Route planner: the order to catch every uncaught Fish Guide fish, from now.
// 1. Untimed fish → spot stops by greedy set cover (most unplanned fish first), grouped zone by zone in log order.
// 2. Timed fish by simulating the clock: rare ones (next chance > 3 h after) as soon as their window opens, frequent
//    ones after a stop in their zone if open then; leftovers window by window.
//    Rough durations: 2 min per fish (+1 per mooch step), 6 min per timed fish, 1.5 min travel per stop.
// 3. Ocean fishing last, by voyage stop.
// includeTimed / includeBig false leave time/weather-limited fish / big fish (ocean rares too) out of the route.
import { XIVAPI, SCHEMA_PARAM, getJson } from "./xivapi.js";
import { baitChains, isTimedEntry } from "./teamcraft.js";
import { nextWindow } from "./timers.js";

const MIN = 60, PER_FISH = 2 * MIN, PER_MOOCH = MIN, PER_TIMED = 6 * MIN, TRAVEL = 90, TOO_LATE = 3 * MIN;
const RARE = 3 * 3600;

let oceanRoutes = null;
/** Ocean fishing: { spots: [{ id, name, main, sub }] (FishingSpot ids), routes: [{ stops: [[ikdSpot, timeOfDay]…] }] }. */
export function loadOceanRoutes({ fetchFn = fetch } = {}) {
  oceanRoutes ??= Promise.all([
    // @as(raw): row ids only (plain SpotMain would expand whole FishingSpot rows: ~730 KB instead of ~9 KB)
    getJson(`${XIVAPI}/sheet/IKDSpot?limit=500&fields=PlaceName.Name,SpotMain@as(raw),SpotSub@as(raw)&${SCHEMA_PARAM}`, { fetchFn }),
    getJson(`${XIVAPI}/sheet/IKDRoute?limit=500&fields=Spot@as(raw),Time[].TimeOfDay&${SCHEMA_PARAM}`, { fetchFn }),
  ]).then(([spots, routes]) => ({
    spots: spots.rows.filter(r => r.row_id > 0).map(r => ({ id: r.row_id, name: r.fields.PlaceName?.fields?.Name ?? "",
      main: r.fields["SpotMain@as(raw)"], sub: r.fields["SpotSub@as(raw)"] })),
    routes: routes.rows.filter(r => r.row_id > 0).map(r => ({
      stops: r.fields["Spot@as(raw)"].map((s, i) => [s, r.fields.Time[i]?.fields?.TimeOfDay]).filter(([s]) => s > 0) })),
  })).catch(e => { oceanRoutes = null; throw e; });
  return oceanRoutes;
}

/**
 * Plans the route. spotZone: Map(spot → zone id) so stops group by the spot's own zone.
 * Returns { steps, left, leftOut (timed fish left out), leftOutBig (big fish left out), minutes }; a step is
 *   { kind: "stop", at, spot, fish } | { kind: "timed", at, f, e, w } | { kind: "ocean", stop, fish }
 *   | { kind: "nowindow", fish } | { kind: "nodata", fish }   (at = planned start, Unix seconds)
 */
export function planLogRoute({ fish, sources, windows, ocean, oceanCategory, now, spotZone = new Map(), includeTimed = true, includeBig = true }) {
  const index = new Map(fish.map((f, i) => [f.id, i]));
  const timed = [], untimed = [], oceanFish = [], noData = [], noWindow = [], leftOut = [], leftOutBig = [];
  for (const f of fish) {
    const es = sources[f.id];
    if (!includeBig && f.big) leftOutBig.push(f);
    else if (f.cat === oceanCategory) oceanFish.push(f);
    else if (!es?.length) noData.push(f);
    else if (windows.has(f.id)) (includeTimed ? timed : leftOut).push(f);
    else untimed.push(f);
  }

  // 1. spot stops (greedy set cover)
  const bySpot = new Map();
  for (const f of untimed) for (const e of sources[f.id]) {
    if (!bySpot.has(e.spot)) bySpot.set(e.spot, new Set());
    bySpot.get(e.spot).add(f.id);
  }
  const left = new Set(untimed.map(f => f.id)), stops = [];
  while (left.size) {
    let best = null, bestN = 0, bestIdx = Infinity;
    for (const [spot, ids] of bySpot) {
      let n = 0, idx = Infinity;
      for (const id of ids) if (left.has(id)) { n++; idx = Math.min(idx, index.get(id)); }
      if (n > bestN || (n === bestN && n && idx < bestIdx)) { best = spot; bestN = n; bestIdx = idx; }
    }
    const got = [...bySpot.get(best)].filter(id => left.has(id)).sort((a, b) => index.get(a) - index.get(b));
    got.forEach(id => left.delete(id));
    const fl = got.map(id => fish[index.get(id)]);
    stops.push({ spot: best, fish: fl, zone: spotZone.get(best) ?? fl[0].zone, idx: index.get(got[0]) });
  }
  const zoneIdx = new Map();
  for (const s of stops) zoneIdx.set(s.zone, Math.min(zoneIdx.get(s.zone) ?? Infinity, s.idx));
  stops.sort((a, b) => zoneIdx.get(a.zone) - zoneIdx.get(b.zone) || a.idx - b.idx);

  // 2. simulate the clock
  const steps = [];
  const pending = new Map(timed.map(f => [f.id, f]));
  let clock = now, si = 0;
  const winCache = new Map(); // fish id → next usable window; valid until end − TOO_LATE
  const windowFor = (f, from) => {
    let w = winCache.get(f.id);
    if (w !== undefined && (w === null || from <= w.end - TOO_LATE)) return w;
    const t = windows.get(f.id);
    w = nextWindow(t, from);
    if (w && w.start <= from && w.end - from < TOO_LATE) w = nextWindow(t, w.end + 1);
    if (w) { const after = nextWindow(t, w.end + 1); w = { ...w, rare: !after || after.start - w.start > RARE }; }
    winCache.set(f.id, w);
    return w;
  };
  const timedEntry = f => sources[f.id].find(isTimedEntry) ?? sources[f.id][0];
  const doTimed = (f, w) => {
    const at = Math.max(clock, w.start);
    steps.push({ kind: "timed", at, f, e: timedEntry(f), w });
    pending.delete(f.id);
    clock = at + PER_TIMED;
  };
  const stopTime = s => TRAVEL + s.fish.reduce((t, f) => {
    const mooch = Math.max(0, (baitChains(sources, f.id).find(g => g.spots.includes(s.spot))?.chains[0]?.length ?? 1) - 1);
    return t + PER_FISH + mooch * PER_MOOCH;
  }, 0);
  const zoneOf = f => spotZone.get(timedEntry(f).spot) ?? f.zone;
  for (let guard = 0; guard < 5000 && (pending.size || si < stops.length); guard++) {
    // open windows, soonest-closing first; while stops remain, only rare ones
    const stopsLeft = si < stops.length;
    let pick = null, pickW = null;
    for (const f of pending.values()) {
      const w = windowFor(f, clock);
      if (!w) { pending.delete(f.id); noWindow.push(f); continue; }
      if ((w.rare || !stopsLeft) && w.start <= clock + TRAVEL && (!pickW || w.end < pickW.end)) { pick = f; pickW = w; }
    }
    if (pick) { doTimed(pick, pickW); continue; }
    if (stopsLeft) {
      const s = stops[si++];
      steps.push({ kind: "stop", at: clock, spot: s.spot, fish: s.fish });
      clock += stopTime(s);
      for (const f of [...pending.values()].filter(f => zoneOf(f) === s.zone)) {
        const w = windowFor(f, clock);
        if (w && w.start <= clock && w.end - clock >= TOO_LATE) doTimed(f, w);
      }
      continue;
    }
    // only timed fish left: wait for the soonest window
    let soon = Infinity;
    for (const f of pending.values()) { const w = windowFor(f, clock); if (w) soon = Math.min(soon, w.start); }
    if (soon === Infinity) break;
    clock = soon - TRAVEL;
  }
  for (const f of pending.values()) noWindow.push(f);

  // 3. ocean fishing by voyage stop
  const byStop = new Map();
  for (const f of oceanFish) {
    const e = sources[f.id]?.[0];
    const stop = e && ocean.spots.find(s => s.main === e.spot || s.sub === e.spot);
    const key = stop?.id ?? 0;
    if (!byStop.has(key)) byStop.set(key, { kind: "ocean", stop, fish: [] });
    byStop.get(key).fish.push(f);
  }
  steps.push(...[...byStop.values()].sort((a, b) => (a.stop?.id ?? 99) - (b.stop?.id ?? 99)));
  if (noWindow.length) steps.push({ kind: "nowindow", fish: noWindow });
  if (noData.length) steps.push({ kind: "nodata", fish: noData });
  return { steps, left: fish.length, leftOut: leftOut.length, leftOutBig: leftOutBig.length, minutes: Math.round((clock - now) / 60) };
}

/** The plan without one fish (marked caught): order stays as it was. */
export function withoutFish(plan, id) {
  return {
    ...plan,
    steps: plan.steps.map(s => s.fish ? { ...s, fish: s.fish.filter(f => f.id !== id) } : s)
      .filter(s => !(s.fish && !s.fish.length) && !(s.kind === "timed" && s.f.id === id)),
    left: plan.left - 1,
  };
}
