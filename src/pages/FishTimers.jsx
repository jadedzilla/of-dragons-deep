import { memo, useMemo, useState } from "react";
import { useApp } from "../context.js";
import { duration, eorzeaTime, etHour, getTimerData, localTime, nextWindow, pad2 } from "../lib/timers.js";
import { useAsync } from "../hooks/useAsync.js";
import { useNow } from "../hooks/useNow.js";
import { FishIcon } from "../components/FishIcon.jsx";
import { Skeleton } from "../components/Skeleton.jsx";

/** Fish Timers: every time/weather-limited fish, up now first (soonest to end), then upcoming (soonest to start). */
export function FishTimers({ active }) {
  const { fishById, isCaught, openFish } = useApp();
  const { data, error, retry } = useAsync(getTimerData, active);
  const now = useNow(active);
  const [query, setQuery] = useState("");
  const [hideCaught, setHideCaught] = useState(true);
  const [bigOnly, setBigOnly] = useState(false);
  const et = eorzeaTime(now), today = new Date(now * 1000).toDateString();

  const entries = useMemo(() => data ? data.fish.filter(t => fishById.has(t.id)).map(t => ({ t, f: fishById.get(t.id) })) : [], [data, fishById])
    .map(e => ({ ...e, win: windowOf(e.t, now) }));

  const q = query.trim().toLowerCase();
  const shown = entries.filter(e => (!hideCaught || !isCaught(e.f.id)) && (!bigOnly || e.f.big)
    && (!q || e.f.name.toLowerCase().includes(q) || e.f.zone.toLowerCase().includes(q)));
  const up = e => !!e.win && e.win.start <= now;
  const order = e => !e.win ? Infinity : up(e) ? e.win.end : e.win.start;
  // the order only changes when a window opens or closes
  const sorted = [...shown].sort((a, b) => (up(b) - up(a)) || order(a) - order(b));

  return <>
    <div className="tm-head">
      <div className="tm-clock">Eorzea time <b id="tmClock">{`${pad2(et.h)}:${pad2(et.m)}`}</b></div>
      <input className="search tm-search" id="tmSearch" type="search" placeholder="Search fish or zone…" autoComplete="off" aria-label="Search timers"
        value={query} onChange={e => setQuery(e.target.value)} />
      <label className="tm-opt"><input type="checkbox" id="tmHideCaught" checked={hideCaught} onChange={e => setHideCaught(e.target.checked)} /> Hide caught</label>
      <label className="tm-opt"><input type="checkbox" id="tmBigOnly" checked={bigOnly} onChange={e => setBigOnly(e.target.checked)} /> Big fish only</label>
    </div>
    <div className="tm-summary" id="tmSummary">{data && `${shown.filter(up).length} up now · ${shown.length} of ${entries.length} timed fish shown`}</div>
    <div className="tm-list" id="tmList">
      {error ? <div className="empty-msg">Couldn't load the catch windows ({error.message}). <button type="button" className="btn" id="tmRetry" onClick={retry}>Try again</button></div>
        : !data ? <Skeleton kind="timers" label="Loading catch windows…" />
        : !sorted.length ? <div className="empty-msg">No timed fish match.</div>
        : sorted.map(e => <TimerRow key={e.f.id} t={e.t} f={e.f} weather={data.weather} caught={isCaught(e.f.id)} onOpen={openFish} {...status(e, now, today)} />)}
    </div>
    <div className="tm-credit">Catch windows from <a href="https://ffxivteamcraft.com/" target="_blank" rel="noopener">FFXIV Teamcraft</a>
      {" "}· weather from XIVAPI game data · window times in Eorzea time (ET), countdowns and start times in your local time.</div>
  </>;
}

/** What a row's status says now, as plain values, so a row only re-renders when its text changes. */
function status({ win }, now, today) {
  if (!win) return { up: false, countdown: null, at: null };
  if (win.start <= now) return { up: true, countdown: duration(win.end - now), at: null };
  return { up: false, countdown: duration(win.start - now), at: `${startTime(win.start, now, today)} · lasts ${duration(win.end - win.start)}` };
}
// local start times, formatted once per window and day (toLocaleTimeString is slow for hundreds of rows a second)
const startTimes = new Map();
function startTime(start, now, today) {
  const key = `${start}:${today}`;
  if (!startTimes.has(key)) { if (startTimes.size > 5000) startTimes.clear(); startTimes.set(key, localTime(start, now)); }
  return startTimes.get(key);
}

// each fish's current or next window, worked out again once it has ended
const windows = new WeakMap();
function windowOf(t, now) {
  let w = windows.get(t);
  if (w === undefined || (w && w.end <= now)) windows.set(t, w = nextWindow(t, now));
  return w;
}

function WeatherIcons({ ids, weather }) {
  return [...ids].map(id => <WeatherIcon key={id} w={weather[id]} />);
}
/** A weather icon, or its name if the icon can't load. */
export function WeatherIcon({ w, fallback = "?" }) {
  const [failed, setFailed] = useState(false);
  return w?.icon && !failed ? <img className="tm-w" src={w.icon} alt={w.name} title={w.name} onError={() => setFailed(true)} />
    : <span className="tm-wn">{w?.name ?? fallback}</span>;
}

const TimerRow = memo(function TimerRow({ t, f, weather, caught, onOpen, up, countdown, at }) {
  const hours = t.start === t.end || (t.start === 0 && t.end === 24) ? "Any time" : `ET ${etHour(t.start)}–${etHour(t.end)}`;
  return (
    <button type="button" className={`tm-row${up ? " up" : ""}${caught ? " caught" : ""}`} data-id={f.id} onClick={() => onOpen(f)}>
      <span className="tm-icon"><FishIcon fish={f} /></span>
      {" "}<span className="tm-main"><span className="tm-name">{f.big && <i className="tm-big" title="Big fish" />}{f.name}</span>
        {" "}<span className="tm-zone">{f.zone}</span><span className="tm-cond"><span className="tm-hours">{hours}</span>
          {t.weather || t.prev
            ? <span className="tm-weather">{t.prev && <><WeatherIcons ids={t.prev} weather={weather} /><span className="tm-arrow" title="then">→</span></>}
              {t.weather ? <WeatherIcons ids={t.weather} weather={weather} /> : <span className="tm-wn">any weather</span>}</span>
            : <span className="tm-wn">Any weather</span>}</span></span>
      {" "}<span className="tm-status">{
        countdown === null ? <span className="tm-when">No window in the next ~5 weeks</span>
        : up ? <><span className="tm-up">Up now</span><span className="tm-when">ends in <b>{countdown}</b></span></>
        : <><span className="tm-when">in <b>{countdown}</b></span><span className="tm-at">{at}</span></>}
      </span>
    </button>
  );
});
