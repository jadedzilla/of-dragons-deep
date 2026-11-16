// Fish timers: when each time/weather-restricted fish can next be caught.
//
// Catch windows (Eorzea hours, required weather, required previous weather, fishing spot) come from the FFXIV Fish
// Tracker's data.js by Carbuncle Plushy — the game data has no windows, only yes/no restriction flags. The file is
// parsed as text (JSON objects extracted and JSON.parse'd); the tracker's code is never run.
// Weather odds per zone come from XIVAPI game data (TerritoryType → WeatherRate; identical to the tracker's tables).
// Weather is forecast with the game's own formula (as published in the SaintCoinach library).

import { XIVAPI, XIVAPI_SCHEMA } from "./fishsource.js";

export const TRACKER_DATA_URL = "https://ff14fish.carbuncleplushy.com/js/app/data.js";
const EORZEA_HOUR = 175;                 // real seconds per Eorzea hour
const ET_DAY = 24 * EORZEA_HOUR;         // 4200 s
const WEATHER_PERIOD = 8 * EORZEA_HOUR;  // weather changes every 8 Eorzea hours (1400 s)
const MAX_SCAN_PERIODS = 2400;           // look ahead ≈ 39 Earth days for a fish's next window

/** Current Eorzea time as { h, m } for a Unix time in seconds. */
export function eorzeaTime(unixSeconds) {
  const etMinutes = Math.floor(unixSeconds * 60 / EORZEA_HOUR) % (24 * 60);
  return { h: Math.floor(etMinutes / 60), m: etMinutes % 60 };
}

/** The game's weather roll (0–99) for the weather period containing this Unix time (seconds). */
export function forecastTarget(unixSeconds) {
  const bell = Math.floor(unixSeconds / EORZEA_HOUR);
  const increment = (bell + 8 - (bell % 8)) % 24;          // 16:00 → 0, 00:00 → 8, 08:00 → 16
  const days = Math.floor(unixSeconds / ET_DAY) >>> 0;
  const base = days * 100 + increment;
  const step1 = ((base << 11) ^ base) >>> 0;
  const step2 = ((step1 >>> 8) ^ step1) >>> 0;
  return step2 % 100;
}

/** Return the balanced {...} block that starts at the end of `marker`, respecting JSON strings. */
function extractObject(text, marker) {
  const i = text.indexOf(marker);
  if (i < 0) throw new Error(`Marker not found: ${marker}`);
  const start = text.indexOf("{", i + marker.length - 1);
  let depth = 0, inStr = false, esc = false;
  for (let k = start; k < text.length; k++) {
    const c = text[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(text.slice(start, k + 1));
  }
  throw new Error(`Unbalanced block after: ${marker}`);
}

const assetUrl = path => `${XIVAPI}/asset?path=${encodeURIComponent(path)}&format=png`;

// The tracker's data.js is fetched once and shared by the timers and the fish view's best bait (retried if it failed).
let trackerText = null;
function loadTrackerText(fetchFn) {
  trackerText ??= fetchFn(TRACKER_DATA_URL).then(res => {
    if (!res.ok) throw new Error(`FFXIV Fish Tracker HTTP ${res.status}`);
    return res.text();
  }).catch(e => { trackerText = null; throw e; });
  return trackerText;
}

/**
 * Best catch paths: resolves to { paths: Map(fish id → steps), items: { id: { name, icon } } }. Each step is a list
 * of alternative item ids; the first step is the bait, later ones are fish to mooch with.
 */
let catchPaths = null;
export function loadCatchPaths({ fetchFn = fetch } = {}) {
  catchPaths ??= loadTrackerText(fetchFn).then(text => {
    const FISH = extractObject(text, "FISH: {"), ITEMS = extractObject(text, "ITEMS: {");
    const paths = new Map(), items = {};
    for (const f of Object.values(FISH)) {
      if (f.bestCatchPath?.length) paths.set(f._id, f.bestCatchPath.map(step => [].concat(step)));
    }
    for (const it of Object.values(ITEMS)) {
      items[it._id] = { name: it.name_en, icon: it.icon ? assetUrl(`ui/icon/${it.icon.slice(0, 3)}000/${it.icon}.tex`) : null };
    }
    return { paths, items };
  }).catch(e => { catchPaths = null; throw e; });
  return catchPaths;
}

/**
 * Load everything the timers need. Resolves to { fish: [window…], weather: { id: { name, icon } } } where each
 * window is { id, start, end, weather: Set|null, prev: Set|null, territory, rates: [[weatherId, cumulative%]…] }.
 */
export async function loadTimerData({ fetchFn = fetch, signal } = {}) {
  const text = await loadTrackerText(fetchFn);
  const FISH = extractObject(text, "FISH: {"), SPOTS = extractObject(text, "FISHING_SPOTS: {"), SPEAR = extractObject(text, "SPEARFISHING_SPOTS: {");
  const restricted = Object.values(FISH).filter(f =>
    f.location != null && (f.weatherSet.length || f.previousWeatherSet.length || !(f.startHour === 0 && f.endHour === 24)));
  const territoryOf = f => (f.gig ? SPEAR : SPOTS)[f.location]?.territory_id;
  const territories = [...new Set(restricted.map(territoryOf).filter(Boolean))];

  const wr = await fetchFn(`${XIVAPI}/sheet/TerritoryType?rows=${territories.join(",")}&limit=500`
    + `&fields=WeatherRate.Weather[].Name,WeatherRate.Weather[].Icon,WeatherRate.Rate&schema=${encodeURIComponent(XIVAPI_SCHEMA)}`, { signal });
  if (!wr.ok) throw new Error(`XIVAPI HTTP ${wr.status}`);
  const rates = {}, weather = {};
  for (const row of (await wr.json()).rows) {
    const w = row.fields.WeatherRate?.fields;
    if (!w) continue;
    let cumulative = 0;
    rates[row.row_id] = [];
    w.Weather.forEach((x, i) => {
      if (!(w.Rate[i] > 0)) return;
      cumulative += w.Rate[i];
      rates[row.row_id].push([x.row_id, cumulative]);
      weather[x.row_id] ??= { name: x.fields?.Name ?? "", icon: x.fields?.Icon?.path ? assetUrl(x.fields.Icon.path) : null };
    });
  }
  const fish = restricted.map(f => ({
    id: f._id, start: f.startHour, end: f.endHour,
    weather: f.weatherSet.length ? new Set(f.weatherSet) : null,
    prev: f.previousWeatherSet.length ? new Set(f.previousWeatherSet) : null,
    territory: territoryOf(f), rates: rates[territoryOf(f)],
  })).filter(f => f.rates?.length);
  return { fish, weather };
}

const weatherCache = new Map(); // `${territory}:${periodStart}` → weather id
function weatherAt(fish, periodStart) {
  const key = fish.territory + ":" + periodStart;
  let w = weatherCache.get(key);
  if (w === undefined) {
    const target = forecastTarget(periodStart);
    w = fish.rates.find(([, cumulative]) => target < cumulative)?.[0] ?? fish.rates.at(-1)[0];
    if (weatherCache.size > 200000) weatherCache.clear();
    weatherCache.set(key, w);
  }
  return w;
}

/** Real-time intervals [a, b) inside one weather period where the fish's Eorzea hours apply. */
function hoursInPeriod(fish, periodStart) {
  const h0 = Math.round((periodStart % ET_DAY) / EORZEA_HOUR); // 0, 8 or 16
  const dayStart = periodStart - h0 * EORZEA_HOUR;
  const { start, end } = fish;
  const etRanges = start === end ? [[0, 24]] : start < end ? [[start, end]] : [[0, end], [start, 24]];
  const out = [];
  for (const [s, e] of etRanges) {
    const a = Math.max(s, h0), b = Math.min(e, h0 + 8);
    if (a < b) out.push([dayStart + a * EORZEA_HOUR, dayStart + b * EORZEA_HOUR]);
  }
  return out;
}

/** The fish's current or next catch window from `from` (Unix seconds) as { start, end }, or null if none soon. */
export function nextWindow(fish, from) {
  let p = Math.floor(from / WEATHER_PERIOD) * WEATHER_PERIOD;
  let prevWeather = weatherAt(fish, p - WEATHER_PERIOD);
  let open = null;
  for (let i = 0; i < MAX_SCAN_PERIODS; i++, p += WEATHER_PERIOD) {
    const w = weatherAt(fish, p);
    if ((!fish.weather || fish.weather.has(w)) && (!fish.prev || fish.prev.has(prevWeather))) {
      for (const [a, b] of hoursInPeriod(fish, p)) {
        if (b <= from) continue;
        if (open && a <= open.end) open.end = b;           // continues the window
        else if (open) return open;                        // a gap: the open window is complete
        else open = { start: a, end: b };
      }
    }
    if (open && open.end < p + WEATHER_PERIOD) return open; // didn't reach the next period: complete
    prevWeather = w;
  }
  return open;
}

/* ---------- Timers page ---------- */
const tmPad = n => String(n).padStart(2, "0");
function tmEtHour(h) { const m = Math.round(h * 60); return `${tmPad(Math.floor(m / 60) % 24)}:${tmPad(m % 60)}`; }
function tmDuration(s) {
  s = Math.max(0, Math.round(s));
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${tmPad(m)}m`;
  return `${m}m ${tmPad(s % 60)}s`;
}
function tmLocal(unixSeconds, now) {
  const d = new Date(unixSeconds * 1000), today = new Date(now * 1000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return today ? time : `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

/**
 * The Fish Timers page, rendered into `root`. Loads its data the first time it's shown.
 * deps: { byId: Map, isCaught(id), fishIcon(f), onOpen(f), esc(s) }. Returns { show(), hide() }.
 */
export function createTimers(root, { byId, isCaught, fishIcon, onOpen, esc }) {
  root.innerHTML = `
    <div class="tm-head">
      <div class="tm-clock">Eorzea time <b id="tmClock">--:--</b></div>
      <input class="search tm-search" id="tmSearch" type="search" placeholder="Search fish or zone…" autocomplete="off" aria-label="Search timers">
      <label class="tm-opt"><input type="checkbox" id="tmHideCaught" checked> Hide caught</label>
      <label class="tm-opt"><input type="checkbox" id="tmBigOnly"> Big fish only</label>
    </div>
    <div class="tm-summary" id="tmSummary"></div>
    <div class="tm-list" id="tmList"><div class="empty-msg">Loading catch windows…</div></div>
    <div class="tm-credit">Catch windows from the <a href="https://ff14fish.carbuncleplushy.com/" target="_blank" rel="noopener">FFXIV Fish Tracker</a>
      by Carbuncle Plushy · weather from XIVAPI game data · window times in Eorzea time (ET), countdowns and start times in your local time.</div>`;
  const $t = s => root.querySelector(s);
  const list = $t("#tmList"), clock = $t("#tmClock"), summary = $t("#tmSummary");
  let data = null, loading = null, entries = [], visibleRows = [], ticker = null;

  const weatherHtml = set => set ? [...set].map(id => { const w = data.weather[id];
    return w?.icon ? `<img class="tm-w" src="${w.icon}" alt="${esc(w.name)}" title="${esc(w.name)}">` : `<span class="tm-wn">${esc(w?.name ?? "?")}</span>`; }).join("") : "";
  function conditions(t) {
    const hours = t.start === t.end || (t.start === 0 && t.end === 24) ? "Any time" : `ET ${tmEtHour(t.start)}–${tmEtHour(t.end)}`;
    const weather = t.weather || t.prev
      ? `<span class="tm-weather">${t.prev ? weatherHtml(t.prev) + `<span class="tm-arrow" title="then">→</span>` : ""}${t.weather ? weatherHtml(t.weather) : `<span class="tm-wn">any weather</span>`}</span>`
      : `<span class="tm-wn">Any weather</span>`;
    return `<span class="tm-hours">${hours}</span>${weather}`;
  }

  function refreshWindows(now) { for (const e of entries) if (!e.win || e.win.end <= now) e.win = nextWindow(e.t, now); }
  function status(e, now) {
    if (!e.win) return { up: false, order: Infinity, html: `<span class="tm-when">No window in the next ~5 weeks</span>` };
    if (e.win.start <= now) return { up: true, order: e.win.end, html: `<span class="tm-up">Up now</span><span class="tm-when">ends in <b>${tmDuration(e.win.end - now)}</b></span>` };
    return { up: false, order: e.win.start, html: `<span class="tm-when">in <b>${tmDuration(e.win.start - now)}</b></span><span class="tm-at">${tmLocal(e.win.start, now)} · lasts ${tmDuration(e.win.end - e.win.start)}</span>` };
  }

  function render() {
    if (!data) return;
    const now = Date.now() / 1000;
    refreshWindows(now);
    const q = $t("#tmSearch").value.trim().toLowerCase(), hideCaught = $t("#tmHideCaught").checked, bigOnly = $t("#tmBigOnly").checked;
    const shown = entries.filter(e => (!hideCaught || !isCaught(e.f.id)) && (!bigOnly || e.f.big)
      && (!q || e.f.name.toLowerCase().includes(q) || e.f.zone.toLowerCase().includes(q)));
    const st = new Map(shown.map(e => [e, status(e, now)]));
    shown.sort((a, b) => (st.get(b).up - st.get(a).up) || st.get(a).order - st.get(b).order);
    const upCount = shown.filter(e => st.get(e).up).length;
    summary.textContent = `${upCount} up now · ${shown.length} of ${entries.length} timed fish shown`;
    list.innerHTML = shown.length ? shown.map(e => `
      <button type="button" class="tm-row${st.get(e).up ? " up" : ""}${isCaught(e.f.id) ? " caught" : ""}" data-id="${e.f.id}">
        <span class="tm-icon">${fishIcon(e.f)}</span>
        <span class="tm-main"><span class="tm-name">${e.f.big ? `<i class="tm-big" title="Big fish"></i>` : ""}${esc(e.f.name)}</span>
          <span class="tm-zone">${esc(e.f.zone)}</span><span class="tm-cond">${conditions(e.t)}</span></span>
        <span class="tm-status">${st.get(e).html}</span>
      </button>`).join("") : `<div class="empty-msg">No timed fish match.</div>`;
    visibleRows = shown.map(e => ({ e, el: list.querySelector(`.tm-row[data-id="${e.f.id}"] .tm-status`), up: st.get(e).up }));
  }

  // Every second: clock + countdowns; re-sort only when a fish's window opens or closes.
  function tick() {
    const now = Date.now() / 1000, et = eorzeaTime(now);
    clock.textContent = `${tmPad(et.h)}:${tmPad(et.m)}`;
    if (!data) return;
    if (visibleRows.some(r => r.e.win && (now >= r.e.win.end || (!r.up && now >= r.e.win.start)))) return render();
    for (const r of visibleRows) r.el.innerHTML = status(r.e, now).html;
  }

  function load() {
    loading ??= loadTimerData().then(d => {
      data = d;
      entries = d.fish.filter(t => byId.has(t.id)).map(t => ({ t, f: byId.get(t.id), win: null }));
      render();
    }, err => {
      loading = null;
      list.innerHTML = `<div class="empty-msg">Couldn't load the catch windows (${esc(err.message)}). <button type="button" class="btn" id="tmRetry">Try again</button></div>`;
      $t("#tmRetry").addEventListener("click", () => { list.innerHTML = `<div class="empty-msg">Loading catch windows…</div>`; load(); });
    });
    return loading;
  }

  root.addEventListener("input", e => { if (e.target.matches("#tmSearch, #tmHideCaught, #tmBigOnly")) render(); });
  list.addEventListener("click", e => { const row = e.target.closest(".tm-row"); if (row) onOpen(byId.get(+row.dataset.id)); });
  // A weather icon that can't load (offline, XIVAPI unreachable) is replaced by the weather's name.
  list.addEventListener("error", e => {
    if (e.target.matches?.("img.tm-w")) e.target.outerHTML = `<span class="tm-wn">${esc(e.target.alt)}</span>`;
  }, true);

  return {
    show() { load(); render(); tick(); ticker ??= setInterval(tick, 1000); },
    hide() { clearInterval(ticker); ticker = null; },
  };
}
