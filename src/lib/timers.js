// Catch windows: when each time/weather-limited fish can next be caught. Windows come from Teamcraft, zone weather odds
// from XIVAPI (FishingSpot / SpearfishingNotebook → TerritoryType → WeatherRate), and weather is forecast with the
// game's own formula (as in SaintCoinach).
import { XIVAPI, SCHEMA_PARAM, getJson, xivAsset, xivRows } from "./xivapi.js";
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

/**
 * { fish: [window…], weather: { id: { name, icon } } }; a window is { id, start, end (ET hours; start === end = all day),
 * weather: Set|null, prev: Set|null, territory, rates: [[weatherId, cumulative %]…] }. Ocean fishing is left out.
 */
export async function loadTimerData({ fetchFn = fetch, signal } = {}) {
  const [line, spear] = await Promise.all([loadTeamcraft("fishing-sources", fetchFn), loadTeamcraft("spearfishing-sources", fetchFn)]);
  const timedOf = sources => Object.entries(sources).flatMap(([id, entries]) => {
    if (entries.some(e => e.oceanFishingTime !== undefined)) return [];
    const e = entries.find(isTimedEntry);
    return e ? [{ id: +id, e }] : [];
  });
  const lineTimed = timedOf(line), spearTimed = timedOf(spear);

  const W = ["Weather[].Name", "Weather[].Icon", "Rate"].map(f => "TerritoryType.WeatherRate." + f);
  const spotRows = await xivRows("FishingSpot", lineTimed.map(t => t.e.spot), W.join(","), { fetchFn, signal });
  let spearRows = [];
  if (spearTimed.length) {
    const query = encodeURIComponent(spearTimed.map(t => `Item=${t.id}`).join(" "));
    spearRows = (await getJson(`${XIVAPI}/search?sheets=SpearfishingItem&limit=500&query=${query}`
      + `&fields=Item.Name,${W.map(f => "SpearfishingNotebook." + f).join(",")}&${SCHEMA_PARAM}`, { fetchFn, signal })).results;
  }
  const rates = {}, weather = {};
  function addTerritory(tt) {
    const w = tt?.fields?.WeatherRate?.fields;
    if (!w || rates[tt.row_id]) return tt?.row_id;
    let cumulative = 0;
    rates[tt.row_id] = [];
    w.Weather.forEach((x, i) => {
      if (!(w.Rate[i] > 0)) return;
      cumulative += w.Rate[i];
      rates[tt.row_id].push([x.row_id, cumulative]);
      weather[x.row_id] ??= { name: x.fields?.Name ?? "", icon: x.fields?.Icon?.path ? xivAsset(x.fields.Icon.path) : null };
    });
    return tt.row_id;
  }
  const spotTerritory = new Map(spotRows.map(r => [r.row_id, addTerritory(r.fields.TerritoryType)]));
  const spearTerritory = new Map(spearRows.map(r => [r.fields.Item?.value, addTerritory(r.fields.SpearfishingNotebook?.fields?.TerritoryType)]));

  // Teamcraft rounds durations to 2 decimals: snap the end to the ET minute.
  const toMinute = h => Math.round(h * 60) / 60;
  const fish = [...lineTimed.map(t => ({ ...t, territory: spotTerritory.get(t.e.spot) })),
    ...spearTimed.map(t => ({ ...t, territory: spearTerritory.get(t.id) }))].map(({ id, e, territory }) => ({
    id,
    start: e.spawn ?? 0,
    end: e.spawn === undefined || !(e.duration < 24) ? e.spawn ?? 0 : toMinute((e.spawn + e.duration) % 24),
    weather: e.weathers?.length ? new Set(e.weathers) : null,
    prev: e.weathersFrom?.length ? new Set(e.weathersFrom) : null,
    territory, rates: rates[territory],
  })).filter(f => f.rates?.length);
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
