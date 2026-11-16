// Log Route page: the order to catch every uncaught Fish Guide fish, planned from now.
//
// 1. Fish with no time/weather limit are grouped into fishing-spot stops with a greedy set cover over Teamcraft's
//    spots (repeatedly take the spot holding the most still-unplanned fish), so each visit catches as many as possible.
//    Stops are ordered zone by zone, zones in log order (which keeps regions together).
// 2. Time/weather-limited fish are scheduled by simulating the clock from now. Rare ones (the chance after the open
//    window is over 3 h away) are done as soon as their window opens (with at least 3 minutes left), soonest-closing
//    first. Frequent ones are picked up while the route is in their zone and their window is open; whatever is left
//    at the end is done window by window, waiting for the next one when needed. Rough durations: 2 min per fish (+1 per mooch step),
//    6 min per timed fish, 1.5 min travel per stop.
// 3. Ocean fishing fish are grouped by voyage stop at the end (voyages run on their own schedule).
// Each fish carries its route: spot, intuition predators, bait → mooch chain with hookset/tug, lures, snagging,
// minimum Gathering and the window (timers engine). Spearfish aren't part of the fishing log and aren't planned.

import { XIVAPI, XIVAPI_SCHEMA } from "./fishsource.js";
import { baitChains, loadTeamcraft, xivAsset, xivRows } from "./teamcraft.js";
import { getTimerData, nextWindow, tmDuration, tmEtHour, tmLocal } from "./timers.js";

const LR_HOOKSETS = { 1: "Powerful", 2: "Precision" };
const LR_TUGS = { 0: "medium (!!)", 1: "heavy (!!!)", 2: "light (!)" };
// Teamcraft's oceanFishingTime: 1 Sunset, 2 Day, 3 Night (checked on Sothis = Night, Stonescale = Sunset,
// Elasmosaurus = Day, …). IKDTimeDefine.TimeOfDay: 1 Day, 2 Sunset, 3 Night.
const TC_TO_IKD_TIME = { 1: 2, 2: 1, 3: 3 };
const IKD_TIME_NAMES = { 1: "Day", 2: "Sunset", 3: "Night" };
const RUBY_FIRST_STOP = 8; // IKDSpot rows 1–7 are Indigo route stops (from Limsa Lominsa), 8+ Ruby route (from Kugane)
const MIN = 60, PER_FISH = 2 * MIN, PER_MOOCH = MIN, PER_TIMED = 6 * MIN, TRAVEL = 90, TOO_LATE = 3 * MIN;
const RARE = 3 * 3600; // a window whose next chance is over 3 h away is "rare": go when it opens; others are caught when nearby
const STEP_PAGE = 15;

let oceanRoutesPromise = null;
/** Ocean fishing: { spots: [{ id, name, main, sub }] (FishingSpot ids), routes: [{ stops: [[ikdSpot, timeOfDay]…] }] }. */
export function loadOceanRoutes() {
  const schema = `schema=${encodeURIComponent(XIVAPI_SCHEMA)}`;
  const get = url => fetch(url).then(r => { if (!r.ok) throw new Error(`XIVAPI HTTP ${r.status}`); return r.json(); });
  oceanRoutesPromise ??= Promise.all([
    get(`${XIVAPI}/sheet/IKDSpot?limit=500&fields=PlaceName.Name,SpotMain,SpotSub&${schema}`),
    get(`${XIVAPI}/sheet/IKDRoute?limit=500&fields=Spot,Time[].TimeOfDay&${schema}`),
  ]).then(([spots, routes]) => ({
    spots: spots.rows.filter(r => r.row_id > 0).map(r => ({ id: r.row_id, name: r.fields.PlaceName?.fields?.Name ?? "",
      main: r.fields.SpotMain?.value, sub: r.fields.SpotSub?.value })),
    routes: routes.rows.filter(r => r.row_id > 0).map(r => ({
      stops: r.fields.Spot.map((s, i) => [s.value ?? s.row_id, r.fields.Time[i]?.fields?.TimeOfDay]).filter(([s]) => s > 0) })),
  })).catch(e => { oceanRoutesPromise = null; throw e; });
  return oceanRoutesPromise;
}

const lrTimed = e => e.spawn !== undefined || e.weathers?.length || e.weathersFrom?.length;

/**
 * Plan the route (spotZone: Map(spot → zone id), from Teamcraft's fishing-spots.json, so stops group by the spot's own
 * zone — a fish's other spots can be in another zone). Returns { steps, left, minutes } where each step is
 *   { kind: "stop", at, spot, fish: [f…] } | { kind: "timed", at, f, e, w } | { kind: "ocean", stop, fish: [f…] }
 *   | { kind: "nowindow", fish } | { kind: "nodata", fish }   (at = planned start, Unix seconds).
 */
export function planLogRoute({ fish, sources, windows, ocean, oceanCategory, now, spotZone = new Map() }) {
  const index = new Map(fish.map((f, i) => [f.id, i]));
  const timed = [], untimed = [], oceanFish = [], noData = [], noWindow = [];
  for (const f of fish) {
    const es = sources[f.id];
    if (f.cat === oceanCategory) oceanFish.push(f);
    else if (!es?.length) noData.push(f);
    else if (windows.has(f.id)) timed.push(f);
    else untimed.push(f);
  }

  // 1. spot stops for untimed fish (greedy set cover)
  const bySpot = new Map(); // spot → Set(fish id)
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
  // zone by zone, zones (and stops within them) in log order
  const zoneIdx = new Map();
  for (const s of stops) zoneIdx.set(s.zone, Math.min(zoneIdx.get(s.zone) ?? Infinity, s.idx));
  stops.sort((a, b) => zoneIdx.get(a.zone) - zoneIdx.get(b.zone) || a.idx - b.idx);

  // 2. simulate the clock, slotting timed fish into their windows
  const steps = [];
  const pending = new Map(timed.map(f => [f.id, f]));
  let clock = now, si = 0;
  const winCache = new Map(); // fish id → its next usable window (+ gap to the chance after); valid until end − TOO_LATE
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
  const doTimed = (f, w) => {
    const at = Math.max(clock, w.start);
    steps.push({ kind: "timed", at, f, e: sources[f.id].find(lrTimed) ?? sources[f.id][0], w });
    pending.delete(f.id);
    clock = at + PER_TIMED;
  };
  const stopTime = s => TRAVEL + s.fish.reduce((t, f) => {
    const mooch = Math.max(0, (baitChains(sources, f.id).find(g => g.spots.includes(s.spot))?.chains[0]?.length ?? 1) - 1);
    return t + PER_FISH + mooch * PER_MOOCH;
  }, 0);
  for (let guard = 0; guard < 5000 && (pending.size || si < stops.length); guard++) {
    // timed fish whose window is open now (soonest to close first); while spot stops remain, only rare ones
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
      // while in this zone: frequent timed fish here whose window is open now
      const zoneOf = f => spotZone.get((sources[f.id].find(lrTimed) ?? sources[f.id][0]).spot) ?? f.zone;
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

  // 3. ocean fishing, grouped by voyage stop
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
  return { steps, left: fish.length, minutes: Math.round((clock - now) / 60) };
}

/**
 * Render the Log Route page into `root`.
 * deps: { fishList, byId, isCaught(id), markCaught(id), fishIcon(f), onOpen(f), esc(s), oceanCategory }. Returns { show(), hide() }.
 */
export function createLogRoute(root, { fishList, byId, isCaught, markCaught, fishIcon, onOpen, esc, oceanCategory }) {
  root.innerHTML = `
    <div class="lr-head">
      <div class="lr-summary" id="lrSummary"></div>
      <button type="button" class="btn small" id="lrRecalc" title="Plan again from the current time">↻ Re-plan from now</button>
    </div>
    <div class="ns-intro">Your remaining Fish Guide fish in the order to catch them, planned from now: fish with no time or weather
      limit are grouped into as few fishing spots as possible, and fish with a catch window are slotted in when their window opens.
      Times are estimates. Ocean fishing comes last, grouped by voyage stop.</div>
    <div class="ns-list" id="lrList"><div class="empty-msg">Planning your route…</div></div>
    <div class="tm-credit">Places, weather and voyages from XIVAPI game data; spots, bait, hooksets, tugs, intuition and catch windows from
      <a href="https://ffxivteamcraft.com/" target="_blank" rel="noopener">FFXIV Teamcraft</a>. Spearfish aren't planned (separate log, no spot data).</div>`;
  const list = root.querySelector("#lrList"), summary = root.querySelector("#lrSummary");
  let base = null, loading = null, plan = null, shown = STEP_PAGE;
  const names = { item: new Map(), spot: new Map(), weather: new Map() };

  // ---------- route text ----------
  const entryAt = (id, spot) => (base.sources[id] ?? []).find(x => x.spot === spot) ?? (base.sources[id] ?? [])[0];
  const chainsAt = (id, spot) => (baitChains(base.sources, id).find(g => g.spots.includes(spot)) ?? baitChains(base.sources, id)[0])?.chains ?? [];
  const itemName = id => byId.get(id)?.name ?? names.item.get(id)?.name ?? `Item ${id}`;
  const itemHtml = id => {
    const icon = names.item.get(id)?.icon;
    return `<span class="ns-item">${icon ? `<img src="${esc(icon)}" alt="" loading="lazy" onerror="this.remove()">` : ""}${esc(itemName(id))}</span>`;
  };
  const hookTug = e => e ? [LR_HOOKSETS[e.hookset] && `${LR_HOOKSETS[e.hookset]}`, LR_TUGS[e.tug]].filter(Boolean).join(", ") : "";
  const spotHtml = (spot, f) => {
    const n = names.spot.get(spot)?.name, zone = names.spot.get(spot)?.zone ?? f.zone;
    return `<b>${esc(n ?? zone)}</b>${n && n !== zone ? `, ${esc(zone)}` : ""}`;
  };
  const weatherHtml = ids => ids.map(id => { const w = base.weather[id] ?? names.weather.get(id);
    return w?.icon ? `<img class="tm-w" src="${esc(w.icon)}" alt="${esc(w.name)}" title="${esc(w.name)}">` : `<span class="tm-wn">${esc(w?.name ?? `weather ${id}`)}</span>`; }).join("");

  /** "Lugworm → Merlthor Goby (Powerful, medium (!!)) → hook" as one line, plus intuition/lure/snag notes. */
  function catchLine(f, spot) {
    const e = entryAt(f.id, spot), parts = [];
    for (const p of e?.predators ?? []) {
      const c = chainsAt(p.id, spot)[0];
      parts.push(`first catch <b>${p.amount}×</b> ${itemHtml(p.id)}${c ? ` (${c.map(itemHtml).join(" → ")})` : ""} for <b>Fisher's Intuition</b>`);
    }
    if (e?.snagging) parts.push(`<b>Snagging</b> on`);
    if (e?.aLure > 0) parts.push(`<b>Ambitious Lure</b> ${e.aLure}×`);
    if (e?.mLure > 0) parts.push(`<b>Modest Lure</b> ${e.mLure}×`);
    if (e?.minGathering > 0) parts.push(`needs <b>${e.minGathering}</b> Gathering`);
    const [chain, ...alts] = chainsAt(f.id, spot);
    const bait = chain ? chain.map((id, i) => i === 0 ? itemHtml(id) : `${itemHtml(id)}${hookTug(entryAt(id, spot)) ? ` <span class="ns-alt">(${hookTug(entryAt(id, spot))})</span>` : ""}`).join(` <span class="tm-arrow">→</span> `)
      + (alts.length ? ` <span class="ns-alt">or ${alts.map(c => itemHtml(c[0])).join(" or ")}${alts.some(c => c.length > 1) ? " (mooch)" : ""}</span>` : "")
      : `<span class="ns-alt">bait unknown</span>`;
    return `<div class="lr-bait">${bait} <span class="tm-arrow">→</span> <b>${esc(f.name)}</b>${hookTug(e) ? ` <span class="ns-alt">(${hookTug(e)})</span>` : ""}</div>`
      + (parts.length ? `<div class="lr-notes">${parts.join(" · ")}</div>` : "");
  }

  const fishRow = (f, spot, extra = "") => `
    <li class="lr-f">
      <button type="button" class="ns-ficon" data-open="${f.id}" title="Details">${fishIcon(f)}</button>
      <div class="lr-fmain">
        <div class="lr-fname">${f.big ? `<i class="tm-big"></i>` : ""}${esc(f.name)} <span class="ns-alt">Lv ${f.lvl}</span>${extra}</div>
        ${catchLine(f, spot)}
      </div>
      <button type="button" class="btn small ns-mark" data-mark="${f.id}" title="Mark ${esc(f.name)} as caught">✓</button>
    </li>`;

  function oceanHtml(step) {
    const { stop, fish } = step;
    if (!stop) return `<div class="lr-where">Ocean fishing</div><ol class="lr-fish">${fish.map(f => fishRow(f, base.sources[f.id]?.[0]?.spot)).join("")}</ol>`;
    const port = stop.id >= RUBY_FIRST_STOP ? "Kugane (Ruby route)" : "Limsa Lominsa Lower Decks (Indigo route)";
    const stopName = id => base.ocean.spots.find(x => x.id === id)?.name ?? `stop ${id}`;
    const times = [...new Set(fish.map(f => TC_TO_IKD_TIME[base.sources[f.id]?.[0]?.oceanFishingTime]).filter(Boolean))];
    const voyages = t => base.ocean.routes.filter(r => r.stops.some(([s, tt]) => s === stop.id && tt === t))
      .map(r => r.stops.map(([s, tt]) => `${esc(stopName(s))} (${IKD_TIME_NAMES[tt]})`).join(" → "));
    const row = f => { const e = base.sources[f.id]?.[0], t = TC_TO_IKD_TIME[e?.oceanFishingTime];
      const tags = [e?.spot === stop.sub ? "spectral current" : "", t ? IKD_TIME_NAMES[t] : "", e?.weathers?.length ? `<span class="tm-weather">${weatherHtml(e.weathers)}</span>` : ""].filter(Boolean);
      return fishRow(f, e?.spot, tags.length ? ` <span class="lr-tags">${tags.join(" · ")}</span>` : ""); };
    const normal = fish.filter(f => base.sources[f.id]?.[0]?.spot !== stop.sub), spectral = fish.filter(f => base.sources[f.id]?.[0]?.spot === stop.sub);
    return `<div class="lr-where">Ocean fishing from ${port} — stop <b>${esc(stop.name)}</b> · ${fish.length} fish</div>
      ${times.length ? `<div class="lr-notes">Time-of-day fish need a voyage that reaches ${esc(stop.name)} then: ${times.map(t => `<b>${IKD_TIME_NAMES[t]}</b> — ${voyages(t).slice(0, 1).join("")}`).join("; ")}.</div>` : ""}
      ${normal.length ? `<ol class="lr-fish">${normal.map(row).join("")}</ol>` : ""}
      ${spectral.length ? `<div class="lr-sub">During a spectral current</div><ol class="lr-fish">${spectral.map(row).join("")}</ol>` : ""}`;
  }

  function stepHtml(step, n, now) {
    if (step.kind === "stop") {
      const f0 = step.fish[0], baits = [...new Set(step.fish.map(f => chainsAt(f.id, step.spot)[0]?.[0]).filter(Boolean))];
      return `<div class="lr-when">${step.at <= now + 60 ? "Now" : `≈ ${tmLocal(step.at, now)}`}</div>
        <div class="lr-where">Go to ${spotHtml(step.spot, f0)} · ${step.fish.length} fish</div>
        <div class="lr-notes">Bring: ${baits.map(itemHtml).join(", ") || "—"}</div>
        <ol class="lr-fish">${step.fish.map(f => fishRow(f, step.spot)).join("")}</ol>`;
    }
    if (step.kind === "timed") {
      const { f, e, w } = step, t = base.windows.get(f.id);
      const hours = t.start === t.end ? "" : `ET ${tmEtHour(t.start)}–${tmEtHour(t.end)}`;
      const weather = (t.prev ? weatherHtml([...t.prev]) + `<span class="tm-arrow" title="then">→</span>` : "") + (t.weather ? weatherHtml([...t.weather]) : "");
      const status = w.start <= now ? `<span class="tm-up">up now</span>, ends in <b>${tmDuration(w.end - now)}</b>`
        : `window opens ${tmLocal(w.start, now)} (in <b>${tmDuration(w.start - now)}</b>), lasts ${tmDuration(w.end - w.start)}`;
      return `<div class="lr-when">${step.at <= now + 60 ? "Now" : `≈ ${tmLocal(step.at, now)}`}</div>
        <div class="lr-where">Go to ${spotHtml(e.spot, f)} for a timed fish</div>
        <div class="lr-notes">${[hours, weather && `<span class="tm-weather">${weather}</span>`].filter(Boolean).join(" ")} — ${status}</div>
        <ol class="lr-fish">${fishRow(f, e.spot)}</ol>`;
    }
    if (step.kind === "ocean") return oceanHtml(step);
    if (step.kind === "nowindow") return `<div class="lr-where">No catch window in the next ~5 weeks · ${step.fish.length} fish</div><ol class="lr-fish">${step.fish.map(f => fishRow(f, entryAt(f.id)?.spot)).join("")}</ol>`;
    return `<div class="lr-where">No route data yet · ${step.fish.length} fish</div><div class="lr-notes">${step.fish.map(f => esc(f.name)).join(", ")}</div>`;
  }

  // ---------- names for what's on screen ----------
  async function ensureNames(steps) {
    const items = new Set(), spots = new Set(), weathers = new Set();
    for (const s of steps) {
      const spotOf = f => s.kind === "stop" ? s.spot : s.kind === "timed" ? s.e.spot : entryAt(f.id)?.spot;
      for (const f of s.fish ?? [s.f]) {
        const spot = spotOf(f);
        if (spot !== undefined) spots.add(spot);
        chainsAt(f.id, spot).flat().forEach(id => items.add(id));
        const e = entryAt(f.id, spot);
        for (const p of e?.predators ?? []) { items.add(p.id); chainsAt(p.id, spot).flat().forEach(id => items.add(id)); }
        for (const w of e?.weathers ?? []) if (!base.weather[w]) weathers.add(w);
      }
    }
    const missing = (set, map) => [...set].filter(id => !map.has(id));
    const toIcon = f => f?.Icon?.path ? xivAsset(f.Icon.path) : null;
    const [ir, sr, wr] = await Promise.all([
      missing(items, names.item).length ? xivRows("Item", missing(items, names.item), "Name,Icon") : [],
      missing(spots, names.spot).length ? xivRows("FishingSpot", missing(spots, names.spot), "PlaceName.Name,TerritoryType.PlaceName.Name") : [],
      missing(weathers, names.weather).length ? xivRows("Weather", missing(weathers, names.weather), "Name,Icon") : [],
    ]).catch(() => [[], [], []]); // names are nice-to-have: fall back to "Item 1234" / the zone
    ir.forEach(r => names.item.set(r.row_id, { name: r.fields.Name, icon: toIcon(r.fields) }));
    sr.forEach(r => names.spot.set(r.row_id, { name: r.fields.PlaceName?.fields?.Name || null,
      zone: r.fields.TerritoryType?.fields?.PlaceName?.fields?.Name || null }));
    wr.forEach(r => names.weather.set(r.row_id, { name: r.fields.Name, icon: toIcon(r.fields) }));
  }

  // ---------- render ----------
  let token = 0;
  function replan() {
    const now = Date.now() / 1000;
    plan = { ...planLogRoute({ fish: fishList.filter(f => !isCaught(f.id)), sources: base.sources, windows: base.windows,
      ocean: base.ocean, oceanCategory, now, spotZone: base.spotZone }), now };
  }
  async function render() {
    if (!plan) return;
    const my = ++token, { steps, now } = plan, visible = steps.slice(0, shown);
    await ensureNames(visible);
    if (my !== token) return;
    const caught = fishList.length - plan.left, hours = plan.minutes / 60;
    summary.innerHTML = plan.left
      ? `<b>${plan.left.toLocaleString("en-US")}</b> fish left (${caught.toLocaleString("en-US")} / ${fishList.length.toLocaleString("en-US")} caught) · ${steps.length} steps · land fishing ≈ <b>${hours >= 1 ? `${Math.round(hours)} h` : `${plan.minutes} min`}</b>`
      : `Fish Guide complete! 🎉`;
    list.innerHTML = plan.left ? `<ol class="lr-steps">${visible.map((s, i) => `<li class="lr-step ${s.kind}${s.kind === "timed" && s.w.start <= now ? " up" : ""}">
        <span class="ns-rank">${i + 1}</span><div class="lr-body">${stepHtml(s, i + 1, now)}</div></li>`).join("")}</ol>`
      + (steps.length > shown ? `<button type="button" class="btn ns-more-ach" id="lrMore">Show ${Math.min(STEP_PAGE, steps.length - shown)} more steps (${steps.length - shown} left)</button>` : "")
      : `<div class="empty-msg">Every Fish Guide fish is caught. 🎉</div>`;
  }

  function load() {
    loading ??= Promise.all([loadTeamcraft("fishing-sources"), loadTeamcraft("fishing-spots"), getTimerData(), loadOceanRoutes()]).then(([sources, spots, td, ocean]) => {
      base = { sources, ocean, windows: new Map(td.fish.map(t => [t.id, t])), weather: td.weather, spotZone: new Map(spots.map(x => [x.id, x.zoneId])) };
      replan();
      return render();
    }, err => {
      loading = null;
      list.innerHTML = `<div class="empty-msg">Couldn't plan the route (${esc(err.message)}). <button type="button" class="btn" id="lrRetry">Try again</button></div>`;
      root.querySelector("#lrRetry").addEventListener("click", () => { list.innerHTML = `<div class="empty-msg">Planning your route…</div>`; load(); });
    });
    return loading;
  }

  list.addEventListener("click", e => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.open) onOpen(byId.get(+t.dataset.open));
    else if (t.dataset.mark) { // caught: drop it from the plan without re-planning everything (keeps the order stable)
      const id = +t.dataset.mark;
      markCaught(id);
      plan.steps = plan.steps.map(s => s.fish ? { ...s, fish: s.fish.filter(f => f.id !== id) } : s)
        .filter(s => !(s.fish && !s.fish.length) && !(s.kind === "timed" && s.f.id === id));
      plan.left--;
      render();
    } else if (t.id === "lrMore") { shown += STEP_PAGE; render(); }
  });
  root.querySelector("#lrRecalc").addEventListener("click", () => { if (base) { replan(); shown = STEP_PAGE; render(); } });

  return {
    show() { if (base) { replan(); render(); } else load(); },
    hide() {},
  };
}
