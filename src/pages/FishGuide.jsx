import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context.js";
import { CATEGORIES, OCEAN_FISHING } from "../lib/fishData.js";
import { prefetchSheets, sheetCount, sheetsFor, sheetsReady } from "../lib/icons.js";
import { pageSlots } from "../lib/pager.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { Dialog } from "../components/Dialog.jsx";
import { FishIcon } from "../components/FishIcon.jsx";

const PER_PAGE = 100; // 10×10
const allCats = () => new Set(CATEGORIES.map((_, i) => i));
const NO_FILTERS = { status: "all", cats: allCats(), bigOnly: false, collOnly: false };
const pageOf = (list, n) => list.slice(n * PER_PAGE, (n + 1) * PER_PAGE);

/** The Fish Guide: the current tab's list (Fishing or Spearfishing) as a paged 10×10 grid, in log order. */
export function FishGuide({ list, mode, data, hidden }) {
  const { isCaught, setCaught, openFish, openImport } = useApp();
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(NO_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState(false); // off on every load: clicking a fish only changes it while on
  const [tip, setTip] = useState(null);           // { fish, el }
  const [bulk, setBulk] = useState(null);         // true: mark all caught, false: unmark all
  const narrow = useMediaQuery("(max-width:350px)"), phone = useMediaQuery("(max-width:520px)");
  const slots = narrow ? 3 : phone ? 5 : 7; // page slots between the arrows
  const hasBig = list.some(f => f.big);

  const [shownMode, setShownMode] = useState(mode);
  if (mode !== shownMode) { setShownMode(mode); setPage(0); } // a new tab starts at page 1
  if (hidden && (tip || panelOpen)) { setTip(null); setPanelOpen(false); }

  // filters keep the log order; never sort
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter(f =>
      (!q || f.name.toLowerCase().includes(q) || f.zone.toLowerCase().includes(q)) &&
      filters.cats.has(f.cat) &&
      (!filters.bigOnly || f.big || !hasBig) &&
      (!filters.collOnly || f.collectable) &&
      (filters.status === "all" || (filters.status === "caught") === isCaught(f.id)));
  }, [list, query, filters, hasBig, isCaught]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const current = Math.min(page, pageCount - 1);
  const slice = pageOf(visible, current);

  // once this page's icons are in, get the neighbouring pages' sheets ready
  useEffect(() => {
    if (hidden || !data) return;
    const near = [...pageOf(visible, current + 1), ...(current ? pageOf(visible, current - 1) : [])];
    sheetsReady(sheetsFor(slice)).then(() => prefetchSheets(sheetsFor(near), { urgent: true }));
  }, [hidden, data, visible, current]); // eslint-disable-line react-hooks/exhaustive-deps -- slice follows visible + current

  // after the first page shows, quietly load every other sheet so page switches are instant
  const background = useRef(false);
  useEffect(() => {
    if (!data || background.current || navigator.connection?.saveData) return;
    background.current = true;
    const all = () => prefetchSheets(Array.from({ length: sheetCount }, (_, i) => i));
    sheetsReady(sheetsFor(slice)).then(() => "requestIdleCallback" in window ? requestIdleCallback(all, { timeout: 2000 }) : setTimeout(all, 500));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps -- once, after the first page

  // the filter panel closes on a click anywhere else
  const panelRef = useRef(null), filterBtn = useRef(null);
  useEffect(() => {
    if (!panelOpen) return;
    const close = e => { if (!panelRef.current.contains(e.target) && !filterBtn.current.contains(e.target)) setPanelOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [panelOpen]);

  useEffect(() => {
    const hide = () => setTip(null);
    addEventListener("scroll", hide, { passive: true });
    return () => removeEventListener("scroll", hide);
  }, []);

  const go = n => setPage(n);
  const changeFilters = change => { setFilters(f => ({ ...f, ...change })); setPage(0); };
  const activeFilters = (filters.status !== "all") + (filters.cats.size !== CATEGORIES.length) + (filters.bigOnly && hasBig) + filters.collOnly;

  function clickTile(f, el) {
    if (!editing) { setTip(null); return openFish(f); }
    setCaught(c => { const n = new Set(c); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; });
    setTip({ fish: f, el });
  }

  const what = mode === "spear" ? "spearfish" : "fish";
  return (
    <div id="guideView" hidden={hidden}>
      <div className="toolbar">
        <div className="pages" id="pages">
          <button type="button" className="pg arrow" disabled={current === 0} onClick={() => go(current - 1)}>‹</button>
          {pageSlots(current, pageCount, slots).map((p, i) => p === null
            ? <span className="gap" key={`g${i}`}>…</span>
            : <button type="button" key={p} className={`pg${p === current ? " active" : ""}`} onClick={() => go(p)}>{p + 1}</button>)}
          <button type="button" className="pg arrow" disabled={current >= pageCount - 1} onClick={() => go(current + 1)}>›</button>
        </div>
        <input className="search" id="search" type="search" placeholder="Search fish or zone…" autoComplete="off" aria-label="Search fish or zone" title="Search"
          value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} />
        <div className="spacer" />
        <button className={`filter-btn edit-btn${editing ? " on" : ""}`} id="editBtn" type="button" aria-pressed={editing}
          aria-label="Edit mode: turn on to mark fish as caught" onClick={() => setEditing(!editing)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.2V21h3.8l11-11-3.8-3.8zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8z" /></svg>
          <span className="label">Edit</span>
        </button>
        <button className="filter-btn" id="importBtn" type="button" aria-label="Import fish and achievements" onClick={() => { setPanelOpen(false); openImport(); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11 16h2V6.8l3.3 3.3 1.4-1.4L12 3 6.3 8.7l1.4 1.4L11 6.8zM4 18h16v2H4z" /></svg>
          <span className="label">Import</span>
        </button>
        <button className={`filter-btn${panelOpen ? " open" : ""}`} id="filterBtn" type="button" aria-label="Filter" ref={filterBtn} onClick={() => setPanelOpen(!panelOpen)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
          <span className="label">Filter</span> <span className={`count${activeFilters > 0 ? " on" : ""}`} id="filterCount">{activeFilters}</span>
        </button>
        <FilterPanel ref={panelRef} open={panelOpen} list={list} filters={filters} hasBig={hasBig} onChange={changeFilters} />
      </div>

      <div className={`grid${editing ? " editing" : ""}`} id="grid" onMouseLeave={() => setTip(null)}>
        {!data ? <>{Array.from({ length: PER_PAGE }, (_, i) => <div className="tile sk" key={i} />)}<span className="sr-only" role="status">Loading the Fish Guide from XIVAPI…</span></>
          : !visible.length ? <div className="empty-msg">No fish match your search.</div>
          : <>{slice.map(f => (
              <div key={f.id} className={`tile${isCaught(f.id) ? " caught" : ""}${f.big ? " big" : ""}`} data-id={f.id}
                onClick={e => clickTile(f, e.currentTarget)} onMouseEnter={e => setTip({ fish: f, el: e.currentTarget })}>
                <FishIcon fish={f} />
              </div>))}
            {Array.from({ length: PER_PAGE - slice.length }, (_, i) => <div className="tile empty" key={`e${i}`} />)}</>}
      </div>

      <div className="footer">
        <div><span id="hint">{editing ? <><b>Editing:</b> click a fish to mark it caught.</> : <>Turn on <b>Edit</b> to mark fish as caught.</>}</span>
          {" "}<span id="showing" className="showing">{visible.length === list.length ? "" : `${visible.length} match`}</span>
          <div className="bulk" id="bulkBar" hidden={!editing}>
            <button type="button" className="btn small" id="markAllBtn" onClick={() => setBulk(true)}>Mark all caught</button>
            {" "}<button type="button" className="btn small" id="unmarkAllBtn" onClick={() => setBulk(false)}>Mark all uncaught</button>
          </div>
          <div id="dataNote" className="note">{data && `${list.length} ${what} · game data from XIVAPI${data.patch ? ` (patch ${data.patch})` : ""}`}</div>
        </div>
        <div className="legend">
          <span id="bigLegend" className={hasBig ? undefined : "off"}><i style={{ background: "var(--big)", transform: "rotate(45deg)" }} />Big fish</span>
          {" "}<span><i className="check" />Caught</span>
        </div>
      </div>

      <Tooltip tip={hidden ? null : tip} isCaught={isCaught} />
      <BulkDialog markCaught={bulk} mode={mode} list={list} onClose={() => setBulk(null)} />
    </div>
  );
}

function FilterPanel({ ref, open, list, filters, hasBig, onChange }) {
  const counts = useMemo(() => CATEGORIES.map((_, i) => list.filter(f => f.cat === i).length), [list]);
  const toggleCat = (i, on) => { const cats = new Set(filters.cats); on ? cats.add(i) : cats.delete(i); onChange({ cats }); };
  return (
    <div className={`filter-panel${open ? " open" : ""}`} id="filterPanel" ref={ref}>
      <h3>Status</h3>
      {[["all", "All"], ["caught", "Caught"], ["uncaught", "Not caught"]].map(([v, label]) => (
        <label key={v}><input type="radio" name="status" value={v} checked={filters.status === v} onChange={() => onChange({ status: v })} /> {label}</label>))}
      <h3>Category</h3>
      <div id="expFilters">{CATEGORIES.map((c, i) => {
        const n = counts[i];
        return n ? <label key={i}><input type="checkbox" data-cat={i} checked={filters.cats.has(i)} onChange={e => toggleCat(i, e.target.checked)} />{` ${c} `}<span className="n">{n}</span></label> : null;
      })}</div>
      <h3>Type</h3>
      <label hidden={!hasBig}><input type="checkbox" id="bigOnly" checked={filters.bigOnly} onChange={e => onChange({ bigOnly: e.target.checked })} /> Big fish only</label>
      <label><input type="checkbox" id="collOnly" checked={filters.collOnly} onChange={e => onChange({ collOnly: e.target.checked })} /> Collectables only</label>
      <button className="btn small reset" id="resetFilters" type="button" onClick={() => onChange({ ...NO_FILTERS, cats: allCats() })}>Reset filters</button>
    </div>
  );
}

/** The quick tooltip over a tile (mouse hover, or the tile just clicked in Edit mode). */
function Tooltip({ tip, isCaught }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!tip || !tip.el.isConnected) { el.style.display = "none"; return; }
    const r = tip.el.getBoundingClientRect();
    el.style.display = "block";
    const w = el.offsetWidth;
    el.style.left = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)) + "px";
    el.style.top = (r.top - el.offsetHeight - 6 < 0 ? r.bottom + 6 : r.top - el.offsetHeight - 6) + "px";
  });
  const f = tip?.fish;
  const tags = f && [f.big ? "Big fish" : "", f.collectable ? "Collectable" : ""].filter(Boolean).join(" · ");
  return (
    <div className="tooltip" id="tooltip" ref={ref}>{f && <>
      <div className="n">{f.name}</div>
      <div className="m">{f.zone + (f.zone !== f.region ? ", " + f.region : "")}</div>
      <div className="m">{`${f.spear ? "Spearfishing · " : ""}${f.water}${f.cat !== OCEAN_FISHING ? " · Lv. " + f.lvl : ""} · ${CATEGORIES[f.cat]}`}</div>
      {tags && <div className="t">{tags}</div>}
      <div className="m">{isCaught(f.id) ? "✓ Caught" : "Not yet caught"}</div>
    </>}</div>
  );
}

/** Confirms Mark all caught / uncaught for the whole list on the current tab (search and filters ignored). */
function BulkDialog({ markCaught, mode, list, onClose }) {
  const { isCaught, setCaught } = useApp();
  const cancelRef = useRef(null);
  const [shown, setShown] = useState(markCaught);
  if (markCaught !== null && markCaught !== shown) setShown(markCaught);
  const mark = markCaught ?? shown;

  const tab = mode === "spear" ? "Spearfishing" : "Fishing", noun = mode === "spear" ? "spearfish" : "fish";
  const have = list.filter(f => isCaught(f.id)).length, total = list.length;
  const n = (mark ? total - have : have).toLocaleString("en-US");
  const nothing = mark ? have === total : have === 0;
  const text = mark
    ? (have === total ? `Every ${noun} on the ${tab} tab is already caught.`
      : have === 0 ? <>This marks all <b>{n}</b>{` ${noun} on the ${tab} tab as caught.`}</>
      : <>This marks the remaining <b>{n}</b>{` ${noun} on the ${tab} tab as caught, so all ${total.toLocaleString("en-US")} will be caught.`}</>)
    : (have === 0 ? `No ${noun} on the ${tab} tab are marked caught.`
      : <>This unmarks all <b>{n}</b>{` caught ${noun} on the ${tab} tab. It can't be undone (except by marking them again or re-importing).`}</>);

  function confirm() {
    setCaught(c => { const s = new Set(c); for (const f of list) mark ? s.add(f.id) : s.delete(f.id); return s; });
    onClose();
  }
  return (
    <Dialog open={markCaught !== null} onClose={onClose} focusRef={cancelRef} className="import-dialog confirm-dialog" id="bulkDialog" aria-labelledby="bulkTitle">
      <form method="dialog" onSubmit={e => e.preventDefault()}>
        <h2 id="bulkTitle">{mark ? `Mark all ${noun} as caught?` : `Mark all ${noun} as uncaught?`}</h2>
        <p className="hint" id="bulkText">{text}</p>
        <div className="actions">
          <button type="button" className="btn" value="cancel" id="bulkCancel" ref={cancelRef} onClick={onClose}>{nothing ? "Close" : "Cancel"}</button>
          {" "}<button type="button" className={`btn ${mark ? "primary" : "danger"}`} value="confirm" id="bulkGo" hidden={nothing} onClick={confirm}>
            {mark ? "Mark all caught" : "Unmark all"}</button>
        </div>
      </form>
    </Dialog>
  );
}
