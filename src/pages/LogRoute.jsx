import { Fragment, memo, useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../context.js";
import { OCEAN_FISHING } from "../lib/fishData.js";
import { routeList } from "../lib/gatherBuddy.js";
import { loadOceanRoutes, planLogRoute, withoutFish } from "../lib/logRoute.js";
import { KEYS, readRaw, writeRaw } from "../lib/storage.js";
import { baitChains, loadTeamcraft } from "../lib/teamcraft.js";
import { duration, etHour, getTimerData, loadSpots, localTime } from "../lib/timers.js";
import { loadItems } from "../lib/fishFacts.js";
import rules from "../data/rules.json" with { type: "json" };
import { useAsync } from "../hooks/useAsync.js";
import { useNow } from "../hooks/useNow.js";
import { BaitChip } from "../components/BaitChip.jsx";
import { FishIcon } from "../components/FishIcon.jsx";
import { Skeleton } from "../components/Skeleton.jsx";
import { WeatherIcon } from "./FishTimers.jsx";

const STEP_PAGE = 15;
const { hooksets: HOOKSETS, tugs: TUGS } = rules.teamcraft;
// Teamcraft's oceanFishingTime (1 Sunset, 2 Day, 3 Night) → IKDTimeDefine.TimeOfDay (1 Day, 2 Sunset, 3 Night)
const { oceanTimeToIkd: TC_TO_IKD_TIME } = rules.teamcraft;
// IKDSpot 1–7: Indigo route (from Limsa Lominsa); 8+: Ruby route (from Kugane)
const { timeNames: IKD_TIME_NAMES, rubyFirstStop: RUBY_FIRST_STOP } = rules.ocean;

let baseData = null; // everything the planner needs, loaded once
const loadBase = () => {
  baseData ??= Promise.all([loadTeamcraft("fishing-sources"), loadTeamcraft("fishing-spots"), getTimerData(), loadOceanRoutes(), loadItems(), loadSpots()])
    .then(([sources, spots, td, ocean, items, places]) => ({ sources, ocean, weather: td.weather, items, places: places.spots,
      windows: new Map(td.fish.map(t => [t.id, t])), spotZone: new Map(spots.map(x => [x.id, x.zoneId])) }))
    .catch(e => { baseData = null; throw e; });
  return baseData;
};

let nextStepId = 0;
const withIds = plan => ({ ...plan, steps: plan.steps.map(s => ({ ...s, uid: ++nextStepId })) });

/** Log Route: the order to catch every uncaught Fish Guide fish, planned from now. */
export function LogRoute({ active }) {
  const { fish: fishList, fishById, isCaught, setCaught } = useApp();
  const { data: base, error, retry } = useAsync(loadBase, active);
  const [includeTimed, setIncludeTimed] = useState(() => readRaw(KEYS.routeTimed) === "1"); // off by default
  const [includeBig, setIncludeBig] = useState(() => readRaw(KEYS.routeBig) !== "0"); // on by default
  const [includeDelivery, setIncludeDelivery] = useState(() => readRaw(KEYS.routeDelivery) === "1"); // off by default
  const [plan, setPlan] = useState(null);
  const [shown, setShown] = useState(STEP_PAGE);
  const now = useNow(active && !!plan);

  function replan({ timed = includeTimed, big = includeBig, delivery = includeDelivery } = {}) {
    setPlan(withIds(planLogRoute({ fish: fishList.filter(f => !isCaught(f.id)), sources: base.sources, windows: base.windows,
      ocean: base.ocean, oceanCategory: OCEAN_FISHING, now: Date.now() / 1000, spotZone: base.spotZone, includeTimed: timed, includeBig: big,
      includeDelivery: delivery })));
  }
  // planned afresh from the current time each time the page is shown
  // eslint-disable-next-line react-hooks/exhaustive-deps -- replan reads the current options
  useEffect(() => { if (active && base) replan(); }, [active, base]);

  // a timed step whose window has closed drops out (the fish stays uncaught; Re-plan fits it back in)
  const expired = s => s.kind === "timed" && now >= s.w.end;
  const steps = plan?.steps.filter(s => !expired(s)) ?? [];
  const missed = plan ? plan.steps.length - steps.length : 0;

  const markCaught = useCallback(id => {
    setCaught(c => new Set([...c, id]));
    setPlan(p => withoutFish(p, id)); // the order stays as it was
  }, [setCaught]);
  const setTimed = on => {
    setIncludeTimed(on);
    writeRaw(KEYS.routeTimed, on ? "1" : "0");
    if (base) { replan({ timed: on }); setShown(STEP_PAGE); }
  };
  const setBig = on => {
    setIncludeBig(on);
    writeRaw(KEYS.routeBig, on ? "1" : "0");
    if (base) { replan({ big: on }); setShown(STEP_PAGE); }
  };
  const setDelivery = on => {
    setIncludeDelivery(on);
    writeRaw(KEYS.routeDelivery, on ? "1" : "0");
    if (base) { replan({ delivery: on }); setShown(STEP_PAGE); }
  };

  // steps re-render only when this changes or, for timed steps, every second
  const ctx = useMemo(() => ({ base, fishById, markCaught }), [base, fishById, markCaught]);
  const view = plan, visible = steps.slice(0, shown);
  const n = x => x.toLocaleString("en-US");
  return <>
    <div className="lr-head">
      <div className="lr-stats" id="lrSummary">{!view ? <Skeleton kind="routeStats" label="Loading…" />
        : view.left ? <>
          <Stat value={n(view.left)} label={`fish left · ${n(fishList.length - view.left)} / ${n(fishList.length)} caught`} />
          <Stat value={n(steps.length)} label="steps" />
          <Stat value={`≈ ${view.minutes >= 60 ? `${Math.round(view.minutes / 60)} h` : `${view.minutes} min`}`} label="of land fishing" />
        </> : <div className="lr-stat lr-done"><b>Fish Guide complete!</b></div>}</div>
      <div className="lr-head-notes" id="lrNotes">{view?.left > 0 && <>
        {view.leftOut > 0 && <div className="lr-leftout">{`${n(view.leftOut)} timed fish not in the route. Tick `}<b>Include timed fish</b> to add them.</div>}
        {view.leftOutBig > 0 && <div className="lr-leftout">{`${n(view.leftOutBig)} big fish not in the route. Tick `}<b>Include big fish</b> to add them.</div>}
        {view.leftOutDelivery > 0 && <div className="lr-leftout">{`${n(view.leftOutDelivery)} custom delivery fish not in the route. Tick `}<b>Include custom delivery fish</b> to add them.</div>}
        {missed > 0 && <div className="lr-missed">{`${missed} timed fish missed ${missed === 1 ? "its" : "their"} window. `}<b>Re-plan</b>{` to fit ${missed === 1 ? "it" : "them"} back in.`}</div>}
      </>}</div>
      <div className="lr-bar">
        <div className="lr-opts">
          <label className="tm-opt" title="Fish that can only be caught at certain Eorzea times or weather"><input type="checkbox" id="lrTimed" checked={includeTimed} onChange={e => setTimed(e.target.checked)} /> Include timed fish</label>
          <label className="tm-opt" title="Big fish, including ocean fishing's rare fish"><input type="checkbox" id="lrBig" checked={includeBig} onChange={e => setBig(e.target.checked)} /> Include big fish</label>
          <label className="tm-opt" title="Dawntrail custom delivery fish, which only bite once Nitowikwe's or Tiisol Ja's deliveries are unlocked"><input type="checkbox" id="lrDelivery" checked={includeDelivery} onChange={e => setDelivery(e.target.checked)} /> Include custom delivery fish</label>
        </div>
        <div className="lr-actions">
          <button type="button" className="btn small" id="lrRecalc" title="Plan again from the current time" onClick={() => { if (base) { replan(); setShown(STEP_PAGE); } }}>↻ Re-plan</button>
          {" "}<CopyButton plan={plan} />
        </div>
      </div>
      <details className="lr-about"><summary>How the route is planned</summary>
        <div className="ns-intro">Your remaining Fish Guide fish in the order to catch them, planned from now: fish with no time or weather
          limit are grouped into as few fishing spots as possible; with <b>Include timed fish</b> ticked, fish with a catch window are
          slotted in when their window opens. Times are estimates. Ocean fishing comes last, grouped by voyage stop.</div></details>
    </div>
    <div className="ns-list" id="lrList">
      {error ? <div className="empty-msg">Couldn't plan the route. Check your connection, then <button type="button" className="btn" id="lrRetry" onClick={retry}>try again</button></div>
        : !view ? <Skeleton kind="route" label="Planning your route…" />
        : !view.left ? <div className="empty-msg">Every Fish Guide fish is caught.</div>
        : <>
          <ol className="lr-steps">{visible.map((s, i) => (
            <li key={s.uid} className={`lr-step ${s.kind}${s.kind === "timed" && s.w.start <= now ? " up" : ""}`} data-step={s.uid}>
              <span className="ns-rank">{i + 1}</span>
              <div className="lr-body">{i === 0 && <div className="lr-when">Next</div>}<Step step={s} first={i === 0} now={s.kind === "timed" ? now : 0} ctx={ctx} /></div>
            </li>))}
          </ol>
          {steps.length > shown && <button type="button" className="btn ns-more-ach" id="lrMore" onClick={() => setShown(shown + STEP_PAGE)}>
            {`Show ${Math.min(STEP_PAGE, steps.length - shown)} more steps (${steps.length - shown} left)`}</button>}
        </>}
    </div>
    <div className="tm-credit">Places, weather and voyages from XIVAPI game data; spots, bait, hooksets, tugs, intuition and catch windows from
      {" "}<a href="https://ffxivteamcraft.com/" target="_blank" rel="noopener">FFXIV Teamcraft</a>. Spearfish aren't planned (separate log, no spot data).</div>
  </>;
}

const Stat = ({ value, label }) => <>{" "}<div className="lr-stat"><b>{value}</b> <span>{label}</span></div></>;

/** Copies every land step as one GatherBuddy Reborn auto-gather list; shows the outcome for a moment. */
function CopyButton({ plan }) {
  const [result, setResult] = useState(null);
  useEffect(() => { if (result) { const t = setTimeout(() => setResult(null), 2500); return () => clearTimeout(t); } }, [result]);
  const copy = async () => { if (plan) setResult(await copyText(await routeList(plan.steps)) ? "Copied!" : "Couldn't copy"); };
  return (
    <button type="button" className={`btn small${result === "Copied!" ? " done" : ""}`} id="lrGbrAll" onClick={copy}
      title="Copy every land step as one GatherBuddy Reborn auto-gather list (Import from clipboard)">
      {result ?? <><svg className="lr-copy" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8.5" rx="1.5" /><path d="M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v6.5A1.5 1.5 0 0 0 4 11h.5" /></svg>GatherBuddy</>}
    </button>
  );
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* no clipboard API here */ }
  const ta = document.createElement("textarea"); // fallback for browsers/iframes without clipboard access
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { /* ignore */ }
  ta.remove();
  return ok;
}

/* ---------- route text ---------- */
const entryAt = (base, id, spot) => (base.sources[id] ?? []).find(x => x.spot === spot) ?? (base.sources[id] ?? [])[0];
const chainsAt = (base, id, spot) => { const groups = baitChains(base.sources, id); return (groups.find(g => g.spots.includes(spot)) ?? groups[0])?.chains ?? []; };

const join = (list, sep) => list.map((x, i) => <Fragment key={i}>{i > 0 && sep}{x}</Fragment>);
const Arrow = () => <span className="tm-arrow">→</span>;

function Item({ id, ctx }) {
  const name = ctx.fishById.get(id)?.name ?? ctx.base.items.get(id)?.name ?? `Item ${id}`;
  return <BaitChip id={id} name={name} icon={ctx.base.items.get(id)?.icon} className="ns-item" />;
}
const HookTug = ({ e }) => {
  const t = e ? [HOOKSETS[e.hookset], TUGS[e.tug]?.toLowerCase()].filter(Boolean).join(", ") : "";
  return t ? <>{" "}<span className="ns-alt">{`(${t})`}</span></> : null;
};
function Spot({ spot, f, ctx }) {
  const [n, z] = ctx.base.places[spot] ?? [], zone = z || f.zone;
  return <><b>{n ?? zone}</b>{n && n !== zone ? `, ${zone}` : null}</>;
}
const Weathers = ({ ids, ctx }) => ids.map(id => <WeatherIcon key={id} w={ctx.base.weather[id]} fallback={`weather ${id}`} />);

/** The bait → mooch chain to the fish (with hookset and tug per step), then intuition, lures, snagging, Gathering. */
function CatchLine({ f, spot, ctx }) {
  const e = entryAt(ctx.base, f.id, spot), [chain, ...alts] = chainsAt(ctx.base, f.id, spot);
  const notes = [];
  for (const p of e?.predators ?? []) {
    const c = chainsAt(ctx.base, p.id, spot)[0];
    notes.push(<>first catch <b>{`${p.amount}×`}</b> <Item id={p.id} ctx={ctx} />{c && <> ({join(c.map(id => <Item key={id} id={id} ctx={ctx} />), " → ")})</>} for <b>Fisher's Intuition</b></>);
  }
  if (e?.snagging) notes.push(<><b>Snagging</b> on</>);
  if (e?.aLure > 0) notes.push(<><b>Ambitious Lure</b>{` ${e.aLure}×`}</>);
  if (e?.mLure > 0) notes.push(<><b>Modest Lure</b>{` ${e.mLure}×`}</>);
  if (e?.minGathering > 0) notes.push(<>needs <b>{e.minGathering}</b> Gathering</>);
  const bait = chain
    ? <>{join(chain.map((id, i) => <><Item id={id} ctx={ctx} />{i > 0 && <HookTug e={entryAt(ctx.base, id, spot)} />}</>), <> <Arrow /> </>)}
      {alts.length > 0 && <>{" "}<span className="ns-alt">or {join(alts.map(c => <Item id={c[0]} ctx={ctx} />), " or ")}{alts.some(c => c.length > 1) ? " (mooch)" : ""}</span></>}</>
    : <span className="ns-alt">bait unknown</span>;
  return <>
    <div className="lr-bait">{bait} <Arrow /> <b>{f.name}</b><HookTug e={e} /></div>
    {notes.length > 0 && <div className="lr-notes">{join(notes, " · ")}</div>}
  </>;
}

function FishRow({ f, spot, extra, ctx }) {
  const { openFish } = useApp();
  return (
    <li className="lr-f">
      <button type="button" className="ns-ficon" data-open={f.id} title="Details" onClick={() => openFish(f)}><FishIcon fish={f} /></button>
      <div className="lr-fmain">
        <div className="lr-fname">{f.big && <i className="tm-big" />}{f.name + " "}<span className="ns-alt">{`Lv ${f.lvl}`}</span>{extra}</div>
        <CatchLine f={f} spot={spot} ctx={ctx} />
      </div>
      <button type="button" className="btn small ns-mark" data-mark={f.id} title={`Mark ${f.name} as caught`} onClick={() => ctx.markCaught(f.id)}>✓</button>
    </li>
  );
}

const WindowStatus = ({ w, now }) => w.start <= now
  ? <><span className="tm-up">up now</span>, ends in <b>{duration(w.end - now)}</b></>
  : <>{`window opens ${localTime(w.start, now)} (in `}<b>{duration(w.start - now)}</b>{`), lasts ${duration(w.end - w.start)}`}</>;

const Step = memo(function Step({ step, first, now, ctx }) {
  const { base } = ctx;
  if (step.kind === "stop") {
    const baits = [...new Set(step.fish.map(f => chainsAt(base, f.id, step.spot)[0]?.[0]).filter(Boolean))];
    return <>
      <div className="lr-where">Go to <Spot spot={step.spot} f={step.fish[0]} ctx={ctx} />{` · ${step.fish.length} fish`}</div>
      <div className="lr-notes">Bring: {baits.length ? join(baits.map(id => <Item id={id} ctx={ctx} />), ", ") : "none"}</div>
      <ol className="lr-fish">{step.fish.map(f => <FishRow key={f.id} f={f} spot={step.spot} ctx={ctx} />)}</ol>
    </>;
  }
  if (step.kind === "timed") {
    const { f, e, w } = step, t = base.windows.get(f.id);
    const hours = t.start === t.end ? null : `ET ${etHour(t.start)}–${etHour(t.end)}`;
    const weather = (t.prev || t.weather) && <span className="tm-weather">
      {t.prev && <><Weathers ids={[...t.prev]} ctx={ctx} /><span className="tm-arrow" title="then">→</span></>}
      {t.weather && <Weathers ids={[...t.weather]} ctx={ctx} />}</span>;
    return <>
      {!first && <div className="lr-when">{`≈ ${localTime(step.at, now)}`}</div>}
      <div className="lr-where">Go to <Spot spot={e.spot} f={f} ctx={ctx} /> for a timed fish</div>
      <div className="lr-notes">{join([hours, weather].filter(Boolean), " ")} · <span className="lr-countdown"><WindowStatus w={w} now={now} /></span></div>
      <ol className="lr-fish"><FishRow f={f} spot={e.spot} ctx={ctx} /></ol>
    </>;
  }
  if (step.kind === "ocean") return <OceanStep step={step} ctx={ctx} />;
  if (step.kind === "nowindow") return <>
    <div className="lr-where">{`No catch window in the next ~5 weeks · ${step.fish.length} fish`}</div>
    <ol className="lr-fish">{step.fish.map(f => <FishRow key={f.id} f={f} spot={entryAt(base, f.id)?.spot} ctx={ctx} />)}</ol>
  </>;
  return <>
    <div className="lr-where">{`No route data yet · ${step.fish.length} fish`}</div>
    <div className="lr-notes">{step.fish.map(f => f.name).join(", ")}</div>
  </>;
});

function OceanStep({ step: { stop, fish }, ctx }) {
  const { base } = ctx;
  if (!stop) return <><div className="lr-where">Ocean fishing</div>
    <ol className="lr-fish">{fish.map(f => <FishRow key={f.id} f={f} spot={base.sources[f.id]?.[0]?.spot} ctx={ctx} />)}</ol></>;
  const port = stop.id >= RUBY_FIRST_STOP ? "Kugane (Ruby route)" : "Limsa Lominsa Lower Decks (Indigo route)";
  const stopName = id => base.ocean.spots.find(x => x.id === id)?.name ?? `stop ${id}`;
  const entry = f => base.sources[f.id]?.[0];
  const times = [...new Set(fish.map(f => TC_TO_IKD_TIME[entry(f)?.oceanFishingTime]).filter(Boolean))];
  const voyage = t => base.ocean.routes.filter(r => r.stops.some(([s, tt]) => s === stop.id && tt === t))
    .map(r => r.stops.map(([s, tt]) => `${stopName(s)} (${IKD_TIME_NAMES[tt]})`).join(" → "))[0] ?? "";
  const row = f => {
    const e = entry(f), t = TC_TO_IKD_TIME[e?.oceanFishingTime];
    const tags = [e?.spot === stop.sub && "spectral current", t && IKD_TIME_NAMES[t],
      e?.weathers?.length && <span className="tm-weather"><Weathers ids={e.weathers} ctx={ctx} /></span>].filter(Boolean);
    return <FishRow key={f.id} f={f} spot={e?.spot} ctx={ctx} extra={tags.length > 0 && <>{" "}<span className="lr-tags">{join(tags, " · ")}</span></>} />;
  };
  const normal = fish.filter(f => entry(f)?.spot !== stop.sub), spectral = fish.filter(f => entry(f)?.spot === stop.sub);
  return <>
    <div className="lr-where">{`Ocean fishing from ${port}, stop `}<b>{stop.name}</b>{` · ${fish.length} fish`}</div>
    {times.length > 0 && <div className="lr-notes">{`Time-of-day fish need a voyage that reaches ${stop.name} then: `}{join(times.map(t => <><b>{IKD_TIME_NAMES[t]}</b>: {voyage(t)}</>), "; ")}.</div>}
    {normal.length > 0 && <ol className="lr-fish">{normal.map(row)}</ol>}
    {spectral.length > 0 && <><div className="lr-sub">During a spectral current</div><ol className="lr-fish">{spectral.map(row)}</ol></>}
  </>;
}
