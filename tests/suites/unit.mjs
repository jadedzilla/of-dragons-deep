// Pure logic, no browser: data loading, bait chains, the timer engine and the route planner.
import { readFile } from "node:fs/promises";
import { loadFishFromXivapi } from "../../src/fishsource.js";
import { baitChains, hooksetAndTug, loadTeamcraft } from "../../src/teamcraft.js";
import { loadTimerData, nextWindow, forecastTarget, eorzeaTime } from "../../src/timers.js";
import { planLogRoute, loadOceanRoutes } from "../../src/logroute.js";
import { recordedFetch, NET } from "../lib/network.mjs";
import { T0 } from "../lib/app.mjs";


export default async function (t) {
  // ---------- data: live (recorded XIVAPI) and the committed snapshot agree ----------
  const live = await loadFishFromXivapi({ fetchFn: recordedFetch });
  const snapshot = JSON.parse(await readFile(new URL("../../data/fish.json", import.meta.url), "utf8"));
  t.check("live XIVAPI load: 1,517 fish + 289 spearfish", live.rows.length === 1517 && live.spear.length === 289, [live.rows.length, live.spear.length]);
  t.check("snapshot data/fish.json matches the live load (rows, spear, tables)",
    JSON.stringify([snapshot.rows, snapshot.spear, snapshot.tables]) === JSON.stringify([live.rows, live.spear, live.tables]));
  t.check("log order starts with Malm Kelp (4776); spearfishing with Wentletrap (20144)", live.rows[0][0] === 4776 && live.spear[0][0] === 20144);

  // ---------- bait ----------
  const sources = await loadTeamcraft("fishing-sources", recordedFetch);
  const names = id => NET.tables.Item.find(r => r.row_id === id)?.fields.Name ?? id;
  const show = id => baitChains(sources, id).map(g => g.chains.map(c => c.map(names).join(" > ")).join(" | ") + ` @${g.spots.length}`);
  t.check("Malm Kelp: Pill Bug (2 spots) and Lugworm (1 spot)", JSON.stringify(show(4776)) === JSON.stringify(["Pill Bug @2", "Lugworm @1"]), show(4776));
  t.check("Wahoo: mooch chains from Lugworm / Pill Bug via Merlthor Goby", show(4904).every(s => /^(Lugworm|Pill Bug) > Merlthor Goby @\d+$/.test(s)), show(4904));
  t.check("Galadion Goby (ocean): 4 alternatives at one stop", show(28937)[0] === "Plump Worm | Versatile Lure | Krill @1", show(28937));
  t.check("hookset/tug: Wahoo Powerful + Medium; Galadion Goby Precision + Light",
    JSON.stringify([hooksetAndTug(sources, 4904), hooksetAndTug(sources, 28937)]) === JSON.stringify([{ hookset: "Powerful", tug: "Medium (!!)" }, { hookset: "Precision", tug: "Light (!)" }]));

  // ---------- timer engine vs brute force ----------
  const td = await loadTimerData({ fetchFn: recordedFetch });
  t.check("443 timed fish with zone weather", td.fish.length === 443 && Object.keys(td.weather).length > 10, td.fish.length);
  t.check("Eorzea time at T0 is 05:42", JSON.stringify(eorzeaTime(T0)) === JSON.stringify({ h: 5, m: 42 }));
  const weatherAt = (f, s) => { const p = Math.floor(s / 1400) * 1400, v = forecastTarget(p); return f.rates.find(([, c]) => v < c)?.[0] ?? f.rates.at(-1)[0]; };
  const okAt = (f, s) => {
    const h = (s % 4200) / 175, inHours = f.start === f.end || (f.start < f.end ? h >= f.start && h < f.end : h >= f.start || h < f.end);
    return inHours && (!f.weather || f.weather.has(weatherAt(f, s))) && (!f.prev || f.prev.has(weatherAt(f, s - 1400)));
  };
  let checked = 0, bad = [];
  for (const f of td.fish.filter((_, i) => i % 15 === 0)) { // ~30 fish, scanned minute by minute (Eorzea) for 2 days
    const w = nextWindow(f, T0);
    if (!w || w.start > T0 + 2 * 86400) continue;
    checked++;
    let s = T0; while (!okAt(f, s)) s += 175 / 60;
    let e = s; while (okAt(f, e)) e += 175 / 60;
    if (Math.abs(s - Math.max(w.start, T0)) > 3 || Math.abs(e - w.end) > 3) bad.push([f.id, w.start, s, w.end, e]);
  }
  t.check(`nextWindow start and end match a brute-force scan (${checked} fish)`, checked >= 15 && !bad.length, bad);

  // ---------- route planner ----------
  const realFetch = globalThis.fetch; // loadOceanRoutes uses the global fetch
  globalThis.fetch = recordedFetch;
  const ocean = await loadOceanRoutes().finally(() => { globalThis.fetch = realFetch; });
  const zone = snapshot.tables.zone, oceanRegion = snapshot.tables.reg.indexOf("The High Seas");
  const fish = snapshot.rows.map(r => ({ id: r[0], name: r[1], lvl: r[3], zone: zone[r[7]], cat: r[6] === oceanRegion ? 6 : r[4] }));
  const spots = await loadTeamcraft("fishing-spots", recordedFetch);
  const plan = planLogRoute({ fish, sources, windows: new Map(td.fish.map(f => [f.id, f])), ocean, oceanCategory: 6, now: T0,
    spotZone: new Map(spots.map(s => [s.id, s.zoneId])) });
  const planned = plan.steps.flatMap(s => s.fish ?? [s.f]).map(f => f.id);
  t.check("route plans every fish exactly once", planned.length === 1517 && new Set(planned).size === 1517, planned.length);
  const timedSteps = plan.steps.filter(s => s.kind === "stop" || s.kind === "timed");
  t.check("route times never go backwards", timedSteps.every((s, i) => !i || s.at >= timedSteps[i - 1].at));
  t.check("route opens with a rare timed fish whose window is open now", plan.steps[0].kind === "timed" && plan.steps[0].w.rare && plan.steps[0].w.start <= T0);
  const stops = plan.steps.filter(s => s.kind === "stop");
  t.check("spot stops group several fish (≥ 3 per stop on average)", stops.reduce((n, s) => n + s.fish.length, 0) / stops.length >= 3);
  t.check("every stop's fish can be caught at that spot", stops.every(s => s.fish.every(f => sources[f.id].some(e => e.spot === s.spot))));
  const noTimed = planLogRoute({ fish, sources, windows: new Map(td.fish.map(f => [f.id, f])), ocean, oceanCategory: 6, now: T0,
    spotZone: new Map(spots.map(s => [s.id, s.zoneId])), includeTimed: false });
  const noTimedIds = noTimed.steps.flatMap(s => s.fish ?? [s.f]).map(f => f.id);
  t.check("route without timed fish: none planned, the rest exactly once, count reported", noTimed.steps.every(s => s.kind !== "timed" && s.kind !== "nowindow")
    && noTimedIds.length + noTimed.leftOut === 1517 && new Set(noTimedIds).size === noTimedIds.length && noTimed.leftOut > 400, noTimed.leftOut);
  const firstOcean = plan.steps.findIndex(s => s.kind === "ocean");
  t.check("ocean fishing comes after all land steps", firstOcean > 0 && plan.steps.slice(firstOcean).every(s => s.kind === "ocean" || s.kind === "nowindow"));
}
