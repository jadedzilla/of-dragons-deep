import { Fragment, useEffect, useState } from "react";
import { useApp } from "../context.js";
import { basicFacts, canvasFrom, descriptionLines, loadBait, loadDescription } from "../lib/fishFacts.js";
import { BaitChip } from "./BaitChip.jsx";
import { Dialog } from "./Dialog.jsx";
import { FishIcon } from "./FishIcon.jsx";
import { Skeleton, SkInline } from "./Skeleton.jsx";

/** The fish detail view (#fishDialog). Description and bait load on first open; everything else works offline. */
export function FishView({ fish, onClose }) {
  const { isCaught } = useApp();
  const [desc, setDesc] = useState({ id: null, text: undefined });
  const [bait, setBait] = useState({ id: null, info: undefined, failed: false });

  useEffect(() => {
    if (!fish) return;
    let live = true;
    loadDescription(fish.id).then(text => live && setDesc({ id: fish.id, text }));
    if (!fish.spear) loadBait(fish.id).then(info => live && setBait({ id: fish.id, info, failed: false }),
      () => live && setBait({ id: fish.id, info: null, failed: true }));
    return () => { live = false; };
  }, [fish]);

  // keep showing the last fish while the dialog closes
  const [shown, setShown] = useState(fish);
  if (fish && fish !== shown) setShown(fish);
  const f = fish ?? shown;
  if (!f) return <Dialog open={false} className="fish-dialog" id="fishDialog" />;

  const text = desc.id === f.id ? desc.text : undefined;  // undefined: loading; null: unavailable
  const b = bait.id === f.id ? bait : { info: undefined, failed: false };
  const caught = isCaught(f.id);
  const [location, water, ...more] = basicFacts(f), aquarium = more.pop();

  // from Teamcraft: a placeholder while loading, "Unknown" if it has no value
  const fromBait = key => b.failed ? "Unavailable right now" : b.info === undefined ? <SkInline /> : b.info[key] ?? "Unknown";
  const facts = [
    location, water, ...more,
    !f.spear && ["Best bait", <BestBait b={b} />, { className: `fv-bait${b.info?.groups.length ? "" : " pending"}`, id: "fvBait" }],
    !f.spear && ["Hookset", fromBait("hookset"), { id: "fvHook", className: b.info?.hookset ? "" : "pending" }],
    !f.spear && ["Tug", fromBait("tug"), { id: "fvTug", className: b.info?.tug ? "" : "pending" }],
    aquarium,
    ["Canvas", text === undefined ? <SkInline /> : text ? canvasFrom(text) : "Unavailable right now", { id: "fvCanvas", className: text ? "" : "pending" }],
    ["Status", caught ? "Caught" : "Not yet caught"],
    ["Item ID", String(f.id)],
  ].filter(Boolean);

  return (
    <Dialog open={!!fish} onClose={onClose} className="fish-dialog" id="fishDialog" aria-labelledby="fvName">
      <div className="fv-head">
        <div className="fv-icon" id="fvIcon"><FishIcon fish={f} key={f.id} /></div>
        <div className="fv-title">
          <h2 id="fvName">{f.name}</h2>
          <div className="fv-tags" id="fvTags">
            {caught && <span className="caught">✓ Caught</span>}
            {f.big && <span className="big">◆ Big fish</span>}
            {f.collectable && <span className="coll">Collectable</span>}
            {f.spear && <span>Spearfishing</span>}
          </div>
        </div>
        <button type="button" className="fv-x" id="fvClose" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <dl className="fv-facts" id="fvFacts">
        {facts.map(([k, v, attrs]) => <Fragment key={k}><dt>{k}</dt><dd {...attrs}>{v}</dd></Fragment>)}
      </dl>
      <div className="fv-desc" id="fvDesc">
        {text === undefined ? <Skeleton kind="desc" label="Loading description…" />
          : text === null ? <span className="loading">Description unavailable right now.</span>
          : descriptionLines(text).map((l, i) => <div key={i} className={l.note ? "note" : undefined}>{l.text}</div>)}
      </div>
    </Dialog>
  );
}

/** Best bait: one line of alternatives, or one line per group of spots (the most common last, as "other spots"). */
function BestBait({ b }) {
  const { fishById } = useApp();
  if (b.failed) return "Unavailable right now";
  if (b.info === undefined) return <SkInline w="160px" />;
  const { groups, items, spots } = b.info;
  if (!groups.length) return "Unknown";
  const item = id => {
    const it = items[id] ?? { name: fishById.get(id)?.name ?? `Item ${id}` };
    return <BaitChip id={id} name={it.name} icon={it.icon} className="fv-bait-item" />;
  };
  const chain = ids => ids.map((id, i) => <Fragment key={i}>{i > 0 && <><span className="fv-arrow">→</span>{" "}</>}{item(id)}{i > 0 && <>{" "}<span className="fv-or">(mooch)</span></>}{i < ids.length - 1 && " "}</Fragment>);
  const alternatives = chains => chains.map((c, i) => <Fragment key={i}>{i > 0 && <>{" "}<span className="fv-or">or</span>{" "}</>}{chain(c)}</Fragment>);
  if (groups.length === 1) return alternatives(groups[0].chains);
  const elsewhere = groups[0].spots.length > 3;
  const ordered = elsewhere ? [...groups.slice(1), groups[0]] : groups;
  return ordered.map((g, i) => (
    <div className="fv-bait-line" key={i}>{alternatives(g.chains)}{" "}
      <span className="fv-spots">{elsewhere && g === groups[0] ? "at other spots" : "at " + [...new Set(g.spots.map(s => spots[s] ?? `Spot ${s}`))].join(", ")}</span>
    </div>));
}
