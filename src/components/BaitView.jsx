import { Fragment, useEffect, useState } from "react";
import { loadBaitData, VENDORS_SHOWN } from "../lib/baits.js";
import { xivAsset } from "../lib/xivapi.js";
import { Dialog } from "./Dialog.jsx";
import { Img } from "./Img.jsx";
import { Skeleton, SkInline } from "./Skeleton.jsx";

/** Where to get a bait (#baitDialog): vendors (NPC, zone, coordinates, price) and crafting, from src/data/baits.json. */
export function BaitView({ id, onClose }) {
  const [state, setState] = useState({ data: null, error: false });
  useEffect(() => {
    if (id == null || state.data) return;
    loadBaitData().then(data => setState({ data, error: false }), () => setState({ data: null, error: true }));
  }, [id, state.data]);

  const [shown, setShown] = useState(id);
  if (id != null && id !== shown) setShown(id);
  const bait = state.data?.baits[shown];
  const loading = !state.data && !state.error;

  return (
    <Dialog open={id != null} onClose={onClose} className="fish-dialog bait-dialog" id="baitDialog" aria-labelledby="bvName">
      <div className="fv-head">
        <div className="fv-icon bv-icon" id="bvIcon">{bait?.icon && <BaitIcon icon={bait.icon} key={shown} />}</div>
        <div className="fv-title"><h2 id="bvName">{loading ? <SkInline w="140px" /> : bait?.name ?? `Item ${shown}`}</h2><div className="fv-tags"><span>Bait</span></div></div>
        <button type="button" className="fv-x" id="bvClose" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <div className="bv-body" id="bvBody">
        {loading ? <Skeleton kind="bait" label="Loading where to get it…" />
          : state.error ? <div className="loading">Couldn't load bait sources right now.</div>
          : !bait ? <div className="loading">No source information for this bait.</div>
          : <Sources bait={bait} currencies={state.data.currencies} />}
      </div>
    </Dialog>
  );
}

/** The 80px icon, else the 40px one. */
function BaitIcon({ icon }) {
  const [small, setSmall] = useState(false);
  return <img src={xivAsset(small ? icon : icon.replace(/\.tex$/, "_hr1.tex"))} alt="" onError={() => setSmall(true)} />;
}

function Sources({ bait, currencies }) {
  const price = p => p.map(([id, amount], i) => {
    const [name, icon] = currencies[id] ?? [`Item ${id}`, ""];
    return <Fragment key={i}>{i > 0 && " + "}<span className="bv-price">{icon && <Img src={xivAsset(icon)} />}{amount.toLocaleString("en-US") + (id === 1 ? " gil" : ` ${name}`)}</span></Fragment>;
  });
  const rows = list => list.map(([npc, zone, x, y, p], i) => (
    <li key={i}><span className="bv-npc">{npc}</span><span className="bv-where">{zone + " "}<span className="bv-xy">{`(X ${x}, Y ${y})`}</span></span>{price(p)}</li>));
  const first = bait.vendors.slice(0, VENDORS_SHOWN), rest = bait.vendors.slice(VENDORS_SHOWN);
  return <>
    {bait.vendors.length > 0 && <>
      <h3>Sold by</h3><ul className="bv-list">{rows(first)}</ul>
      {rest.length > 0 && <details className="bv-more"><summary>{`${rest.length} more vendor${rest.length > 1 ? "s" : ""}`}</summary><ul className="bv-list">{rows(rest)}</ul></details>}
    </>}
    {bait.crafted.length > 0 && <>
      <h3>Crafted by</h3>
      <ul className="bv-list">{bait.crafted.map(([job, lvl], i) => <li key={i}><span className="bv-npc">{job}</span><span className="bv-where">{`Level ${lvl} recipe`}</span></li>)}</ul>
    </>}
    {!bait.vendors.length && !bait.crafted.length && <div className="loading">Not sold by vendors or crafted. It comes from somewhere else in the game (quests, exchanges or drops).</div>}
    {bait.vendors.length > 0 && <div className="bv-note">Vendors from FFXIV Teamcraft; seasonal-event vendors aren't listed.</div>}
  </>;
}
