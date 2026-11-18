import { useEffect, useMemo, useState } from "react";
import { useApp } from "../context.js";
import { SECTIONS, achievementState, getAchievements } from "../lib/achievements.js";
import { KEYS, noteObtained } from "../lib/storage.js";
import { useAsync } from "../hooks/useAsync.js";
import { useStored } from "../hooks/useStored.js";
import { FishIcon } from "../components/FishIcon.jsx";
import { Skeleton } from "../components/Skeleton.jsx";

const n = x => x.toLocaleString("en-US");

/** Achievements: every Fisher achievement in sections, with progress from caught fish or marked by hand. */
export function Achievements({ active }) {
  const { allFish, fishById, isCaught, marks, setMarks, progress, openImport, openFish } = useApp();
  const { data, error, retry } = useAsync(getAchievements, active);
  const [hideDone, setHideDone] = useState(false);
  const [open, setOpen] = useStored(KEYS.openSections, []);          // sections start collapsed
  const [closedGroups, setClosedGroups] = useStored(KEYS.closedGroups, []); // groups start open

  const s = useMemo(() => data && achievementState(data, { allFish, fishById, isCaught, marks, progress }),
    [data, allFish, fishById, isCaught, marks, progress]);
  const doneIds = s ? data.achievements.filter(a => s.isDone(a)).map(a => a.id) : null;
  useEffect(() => { if (doneIds) noteObtained(doneIds); }, [doneIds?.join()]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the obtained set changes

  const toggle = (list, set, key, on) => set(on ? [...new Set([...list, key])] : list.filter(k => k !== key));
  const mark = (id, on) => setMarks(m => { const x = new Set(m); on ? x.add(id) : x.delete(id); return x; });

  return <>
    <div className="ac-head">
      <div className="ac-summary" id="acSummary">{s && <Summary data={data} s={s} />}</div>
      <div className="ac-tools">
        <label className="tm-opt"><input type="checkbox" id="acHideDone" checked={hideDone} onChange={e => setHideDone(e.target.checked)} /> Hide obtained</label>
        {" "}<button type="button" className="btn small" id="acImportBtn" title="Import your fish and achievements from the Of Dragons Deep plugin" onClick={() => openImport()}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 16h2V6.8l3.3 3.3 1.4-1.4L12 3 6.3 8.7l1.4 1.4L11 6.8zM4 18h16v2H4z" /></svg> Import</button>
      </div>
    </div>
    <div className="ac-imported" id="acImported">{s && progress.at ? `Last imported from the plugin ${new Date(progress.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.` : ""}</div>
    <div className="ac-list" id="acList">
      {error ? <div className="empty-msg">Couldn't load the achievements ({error.message}). <button type="button" className="btn" id="acRetry" onClick={retry}>Try again</button></div>
        : !s ? <Skeleton kind="achievements" label="Loading achievements…" />
        : <Sections data={data} s={s} hideDone={hideDone} open={open} closedGroups={closedGroups}
            onSection={(key, on) => toggle(open, setOpen, key, on)} onGroup={(id, on) => toggle(closedGroups, setClosedGroups, id, !on)}
            onMark={mark} isCaught={isCaught} openFish={openFish} marks={marks} progress={progress} />}
    </div>
    <div className="tm-credit">Achievements from XIVAPI game data. Fish-based progress comes from the fish you've marked caught;
      everything else can be marked obtained by hand (saved in this browser).</div>
  </>;
}

function Summary({ data, s }) {
  const done = data.achievements.filter(a => s.isDone(a));
  const pts = data.achievements.reduce((t, a) => t + a.points, 0), ptsDone = done.reduce((t, a) => t + a.points, 0);
  return <><b>{done.length}</b>{` of ${data.achievements.length} obtained · `}<b>{ptsDone}</b>{` of ${pts} points`}</>;
}

function Sections({ data, s, hideDone, open, closedGroups, onSection, onGroup, ...rowProps }) {
  // a meta achievement goes with what it requires ("No River Wide Enough" → Big fish)
  const sectionOf = a => {
    const r = s.reqs.get(a.id);
    return r.kind !== "meta" ? r.section : r.ids.map(id => s.byId.get(id)).filter(Boolean).map(sectionOf)[0] ?? "other";
  };
  // parts of a meta achievement are listed only inside its group
  const parentOf = new Map();
  for (const a of data.achievements) {
    const r = s.reqs.get(a.id);
    if (r.kind === "meta") for (const id of r.ids) if (s.byId.has(id) && !parentOf.has(id)) parentOf.set(id, a.id);
  }
  const node = (a, depth) => {
    if (hideDone && s.isDone(a)) return null;
    const r = s.reqs.get(a.id);
    if (r.kind !== "meta") return <Row key={a.id} a={a} s={s} sub={depth > 0} {...rowProps} />;
    const parts = r.ids.map(id => s.byId.get(id)).filter(Boolean).map(x => node(x, depth + 1)).filter(Boolean);
    return (
      <details key={a.id} className={`ac-group${depth ? " ac-sub" : ""}`} data-group={a.id} open={!closedGroups.includes(a.id)}
        onToggle={e => { e.stopPropagation(); if (e.currentTarget.open === closedGroups.includes(a.id)) onGroup(a.id, e.currentTarget.open); }}>
        <summary><Row a={a} s={s} chevron {...rowProps} /></summary>
        {parts.length > 0 && <div className="ac-children">{parts}</div>}
      </details>
    );
  };
  return SECTIONS.map(([key, title, note]) => {
    const items = data.achievements.filter(a => sectionOf(a) === key);
    if (!items.length) return null;
    const rows = items.filter(a => !parentOf.has(a.id)).map(a => node(a, 0)).filter(Boolean);
    return (
      <details key={key} className="ac-section" data-section={key} open={open.includes(key)}
        onToggle={e => { if (e.currentTarget.open !== open.includes(key)) onSection(key, e.currentTarget.open); }}>
        <summary><h3>{title + " "}<span className="ac-count">{`${items.filter(a => s.isDone(a)).length} / ${items.length}`}</span></h3></summary>
        <div className="ac-note">{note}</div>
        {rows.length ? rows : <div className="ac-all">All obtained.</div>}
      </details>
    );
  });
}

const Bar = ({ f, children, title }) => (
  <div className="ac-progress" title={title}><div className="ac-bar"><i style={{ width: `${f * 100}%` }} /></div><span>{children}</span></div>
);

function Row({ a, s, sub, chevron, onMark, isCaught, openFish, marks, progress }) {
  const r = s.reqs.get(a.id), done = s.isDone(a);
  let body = null, status = done ? <span className="ac-done">✓ Obtained</span> : null;
  if (r.kind === "count" || r.kind === "set") {
    const need = r.kind === "count" ? r.need : r.fish.length, have = Math.min(need, s.caughtOf(r));
    body = <>
      <Bar f={need ? have / need : 0}>{`${n(have)} / ${n(need)}`}</Bar>
      {r.kind === "set" && <div className="ac-fish">{r.fish.map(f => (
        <button type="button" key={f.id} className={`ac-f${isCaught(f.id) ? " caught" : ""}`} data-fish={f.id} title={`${f.name}${isCaught(f.id) ? " ✓" : ""}`}
          onClick={e => { e.preventDefault(); openFish(f); }}><FishIcon fish={f} /></button>))}</div>}
    </>;
  } else if (r.kind === "meta") {
    body = <Bar f={s.partsDone(r) / r.ids.length}>{`${s.partsDone(r)} / ${r.ids.length} achievements`}</Bar>;
  } else {
    status = <label className="ac-mark"><input type="checkbox" data-mark={a.id} checked={done} onChange={e => onMark(a.id, e.target.checked)} /> Obtained</label>;
    const p = progress.items[a.id];
    if (p && !done && p[1] > 0) body = <Bar f={Math.min(1, p[0] / p[1])} title="From your last plugin import">{`${n(p[0])} / ${n(p[1])} `}<span className="ac-src">in game</span></Bar>;
  }
  if (done && r.kind !== "manual" && marks.has(a.id)) status = <span className="ac-done" title="Reported complete by the game (plugin import)">✓ Obtained</span>;
  return (
    <div className={`ac-row${sub ? " ac-sub" : ""}${done ? " done" : ""}`} data-id={a.id}>
      {chevron && <span className="ac-chev" aria-hidden="true" />}
      <span className="ac-icon">{a.icon && <img src={a.icon} alt="" loading="lazy" />}</span>
      <div className="ac-main">
        <div className="ac-name">{a.name + " "}<span className="ac-pts" title="Achievement points">{a.points}</span></div>
        <div className="ac-desc">{a.desc}</div>{body}
      </div>
      <div className="ac-status">{status}</div>
    </div>
  );
}
