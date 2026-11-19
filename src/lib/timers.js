// Catch windows: when each time/weather-limited fish can next be caught. Windows come from Teamcraft, zone weather odds
// from XIVAPI (src/data/spots.json), and weather is forecast with the game's own formula (as in SaintCoinach).
import { xivAsset } from "./xivapi.js";
import { isTimedEntry, loadTeamcraft } from "./teamcraft.js";

const EORZEA_HOUR = 175;                 // real seconds
const ET_DAY = 24 * EORZEA_HOUR;
const WEATHER_PERIOD = 8 * EORZEA_HOUR;  // weather changes every 8 Eorzea hours
const MAX_SCAN_PERIODS = 2400;           // look ahead ≈ 39 Earth days

/** Eorzea time { h, m } at a Unix time (seconds). */
export function eorzeaTime(unixSeconds) {
  const etMinutes = Math.floor(unixSeconds * 60 / EORZEA_HOUR) % (24 * 60);
  return { h: Math.floor(etMinutes / 60), m: etMinutes % 60 };
}

/** The game's weather roll (0–99) for the weather period containing this Unix time. */
export function forecastTarget(unixSeconds) {
  const bell = Math.floor(unixSeconds / EORZEA_HOUR);
  const increment = (bell + 8 - (bell % 8)) % 24;
  const days = Math.floor(unixSeconds / ET_DAY) >>> 0;
  const base = days * 100 + increment;
  const step1 = ((base << 11) ^ base) >>> 0;
  const step2 = ((step1 >>> 8) ^ step1) >>> 0;
  return step2 % 100;
}

let spots = null;
/** src/data/spots.json: { spots: { id: [name, zone, territory] }, spear: { itemId: territory }, rates, weather }. */
export function loadSpots() {
  spots ??= import("../data/spots.json", { with: { type: "json" } }).then(m => m.default).catch(e => { spots = null; throw e; });
  return spots;
}

/**
 * { fish: [window…], weather: { id: { name, icon } } }; a window is { id, start, end (ET hours; start === end = all day),
 * weather: Set|null, prev: Set|null, territory, rates: [[weatherId, cumulative %]…] }. Ocean fishing is left out.
 */
export async function loadTimerData() {
  const [line, spear, places] = await Promise.all([loadTeamcraft("fishing-sources"), loadTeamcraft("spearfishing-sources"), loadSpots()]);
  const timedOf = sources => Object.entries(sources).flatMap(([id, entries]) => {
    if (entries.some(e => e.oceanFishingTime !== undefined)) return [];
    const e = entries.find(isTimedEntry);
    return e ? [{ id: +id, e }] : [];
  });
  // Teamcraft rounds durations to 2 decimals: snap the end to the ET minute.
  const toMinute = h => Math.round(h * 60) / 60;
  const fish = [...timedOf(line).map(t => ({ ...t, territory: places.spots[t.e.spot]?.[2] })),
    ...timedOf(spear).map(t => ({ ...t, territory: places.spear[t.id] }))].map(({ id, e, territory }) => ({
    id,
    start: e.spawn ?? 0,
    end: e.spawn === undefined || !(e.duration < 24) ? e.spawn ?? 0 : toMinute((e.spawn + e.duration) % 24),
    weather: e.weathers?.length ? new Set(e.weathers) : null,
    prev: e.weathersFrom?.length ? new Set(e.weathersFrom) : null,
    territory, rates: places.rates[territory],
  })).filter(f => f.rates?.length);
  const weather = Object.fromEntries(Object.entries(places.weather).map(([id, [name, icon]]) => [id, { name, icon: xivAsset(icon) }]));
  return { fish, weather };
}

let timerData = null; // shared by Fish Timers and Log Route; dropped on failure so it's retried
export function getTimerData() {
  timerData ??= loadTimerData().catch(e => { timerData = null; throw e; });
  return timerData;
}

const weatherCache = new Map(); // `${territory}:${periodStart}` → weather id
export function weatherAt(fish, periodStart) {
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

/** The current or next window from `from` (Unix seconds) as { start, end }, or null if none in ≈ 39 days. */
export function nextWindow(fish, from) {
  let p = Math.floor(from / WEATHER_PERIOD) * WEATHER_PERIOD;
  let prevWeather = weatherAt(fish, p - WEATHER_PERIOD);
  let open = null;
  for (let i = 0; i < MAX_SCAN_PERIODS; i++, p += WEATHER_PERIOD) {
    const w = weatherAt(fish, p);
    if ((!fish.weather || fish.weather.has(w)) && (!fish.prev || fish.prev.has(prevWeather))) {
      for (const [a, b] of hoursInPeriod(fish, p)) {
        if (b <= from) continue;
        if (open && a <= open.end) open.end = b;   // continues the window
        else if (open) return open;                // a gap: complete
        else open = { start: a, end: b };
      }
    }
    if (open && open.end < p + WEATHER_PERIOD) return open;
    prevWeather = w;
  }
  return open;
}

/* ---------- formatting ---------- */
const pad = n => String(n).padStart(2, "0");
export const pad2 = pad;
/** 16.5 → "16:30" */
export function etHour(h) { const m = Math.round(h * 60); return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`; }
/** Seconds → "2d 3h" / "1h 05m" / "4m 09s". */
export function duration(s) {
  s = Math.max(0, Math.round(s));
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${pad(m)}m`;
  return `${m}m ${pad(s % 60)}s`;
}
/** Local clock time ("05:33 PM"), with the weekday when it isn't today. */
export function localTime(unixSeconds, now) {
  const d = new Date(unixSeconds * 1000), today = new Date(now * 1000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return today ? time : `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
}
