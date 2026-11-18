import { useCallback, useEffect, useMemo, useState } from "react";
import { AppContext } from "./context.js";
import { loadFish } from "./lib/fishData.js";
import { decodeImportLink, parseImport } from "./lib/importFormat.js";
import { KEYS, loadCaught, loadMarks, loadProgress, readRaw, saveCaught, saveMarks, saveProgress, writeRaw } from "./lib/storage.js";
import { useHashRoute } from "./hooks/useHashRoute.js";
import { BaitView } from "./components/BaitView.jsx";
import { FishView } from "./components/FishView.jsx";
import { ImportDialog, OLD_EXPORT, Toast, importSummary } from "./components/ImportDialog.jsx";
import { Skeleton } from "./components/Skeleton.jsx";
import { Reveal } from "./components/reveal/Reveal.jsx";
import { FishGuide } from "./pages/FishGuide.jsx";
import { FishTimers } from "./pages/FishTimers.jsx";
import { Achievements } from "./pages/Achievements.jsx";
import { LogRoute } from "./pages/LogRoute.jsx";
import { Share } from "./pages/Share.jsx";

const PAGES = [["guide", "Fish Guide"], ["timers", "Fish Timers"], ["achievements", "Achievements"], ["route", "Log Route"], ["share", "Share"]];
const SECTIONS = {
  timers: ["timers", "Fish timers", FishTimers], achievements: ["achievements", "Fishing achievements", Achievements],
  route: ["logroute", "Fishing log route", LogRoute], share: ["share", "Share your progress", Share],
};

export function App() {
  const view = useHashRoute();
  const [data, setData] = useState(null);
  const [mode, setMode] = useState(() => readRaw(KEYS.tab) === "spear" ? "spear" : "fish");
  const [caught, setCaughtState] = useState(new Set());
  const [marks, setMarksState] = useState(loadMarks);
  const [progress, setProgressState] = useState(loadProgress);
  const [viewing, setViewing] = useState(null);   // fish in the fish view
  const [bait, setBait] = useState(null);         // bait id in the bait view
  const [importing, setImporting] = useState(null); // null closed, else { preset }
  const [reveal, setReveal] = useState(null);     // { fish, notice }
  const [notice, setNotice] = useState(null);
  const [visited, setVisited] = useState(() => new Set([view])); // pages mount when first opened, then stay
  if (!visited.has(view)) setVisited(new Set([...visited, view]));

  useEffect(() => { // the saved catches arrive with the fish (so no page ever sees the list without them)
    loadFish().then(d => { setData(d); setCaughtState(loadCaught(new Set([...d.fish, ...d.spear].map(f => f.id)))); });
  }, []);
  const allFish = useMemo(() => [...(data?.fish ?? []), ...(data?.spear ?? [])], [data]);
  const fishById = useMemo(() => new Map(allFish.map(f => [f.id, f])), [allFish]);

  const setCaught = useCallback(next => setCaughtState(prev => { const v = typeof next === "function" ? next(prev) : next; saveCaught(v); return v; }), []);
  const setMarks = useCallback(next => setMarksState(prev => { const v = typeof next === "function" ? next(prev) : next; saveMarks(v); return v; }), []);
  const setProgress = useCallback(v => { saveProgress(v); setProgressState(v); }, []);
  const isCaught = useCallback(id => caught.has(id), [caught]);
  const openImport = useCallback(() => setImporting({ preset: null }), []);

  const spearOk = !!data?.spear.length;
  const tab = mode === "spear" && (!data || spearOk) ? "spear" : "fish";
  const list = (tab === "spear" ? data?.spear : data?.fish) ?? [];
  const switchTab = m => { setMode(m); writeRaw(KEYS.tab, m); };

  // ?import=2.… (the plugin's Copy tracker link): fill in the Import dialog, wait for the Import button
  useEffect(() => {
    if (!data) return;
    const params = new URLSearchParams(location.search);
    if (!params.has("import")) return;
    const value = params.get("import");
    params.delete("import");
    const rest = params.toString();
    history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
    decodeImportLink(value).then(text => {
      const p = parseImport(text);
      const n = p.ids.filter(id => fishById.has(id)).length;
      setImporting({ preset: { text, result: { content: <>Loaded <b>{n}</b> fish{p.achievements && <> and <b>{p.achievements.filter(a => a.complete).length}</b> completed achievements</>} from your link. Click <b>Import</b> to replace your current data with it, or choose Add.</> } } });
    }, err => setImporting({ preset: { text: "", result: { warn: true, content: err.old ? OLD_EXPORT : "This import link couldn't be read. It may have been cut off when it was copied." } } }));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps -- once, when the fish list arrives

  function imported(plan) {
    setCaught(plan.newCaught);
    if (plan.hasAchievements) { setMarks(plan.newMarks); setProgress(plan.newProgress); }
    setImporting(null);
    const count = l => [l.filter(f => plan.newCaught.has(f.id)).length, l.length];
    const content = importSummary(plan, { fish: count(data.fish), spear: count(data.spear) });
    const ms = plan.unknown.length || plan.invalid.length ? 9000 : 5000;
    const fresh = plan.fresh.map(id => fishById.get(id));
    if (fresh.length) setReveal({ fish: fresh, notice: { content, ms } }); // the notice shows once the reveal closes
    else setNotice({ content, ms });
  }

  const app = useMemo(() => ({
    fish: data?.fish ?? [], spear: data?.spear ?? [], allFish, fishById,
    caught, isCaught, setCaught, marks, setMarks, progress, setProgress,
    openFish: setViewing, openBait: setBait, openImport,
  }), [data, allFish, fishById, caught, isCaught, setCaught, marks, setMarks, progress, setProgress, openImport]);

  const dismissNotice = useCallback(() => setNotice(null), []);
  const caughtHere = list.filter(f => caught.has(f.id)).length;
  return (
    <AppContext.Provider value={app}>
      <nav className="topnav" id="topnav" aria-label="Pages">
        {PAGES.map(([v, label]) => <a key={v} href={`#${v}`} data-view={v} aria-current={view === v ? "page" : undefined}>{label}</a>)}
      </nav>
      <div className="window">
        <div className="titlebar">
          <h1>Of Dragons Deep</h1>
          <ThemeButton />
          <div className="progress" hidden={view !== "guide"}><b id="caughtCount">{caughtHere}</b> / <span id="totalCount">{list.length}</span> caught</div>
        </div>
        <div className="body">
          <FishGuide list={list} mode={tab} data={data} hidden={view !== "guide"} />
          {Object.entries(SECTIONS).map(([v, [cls, label, Page]]) => (
            <section key={v} id={`${v}View`} className={cls} hidden={view !== v} aria-label={label}>
              {!visited.has(v) ? null : data ? <Page active={view === v} /> : <Skeleton kind={v === "share" ? "share" : "page"} />}
            </section>))}
        </div>
        <div className="tabs" id="tabs" role="tablist" aria-label="Guide" hidden={view !== "guide" || (data && !spearOk)}>
          {[["fish", "Fishing"], ["spear", "Spearfishing"]].map(([m, label]) => (
            <button key={m} className={`tab${tab === m ? " active" : ""}`} type="button" role="tab" aria-selected={tab === m} data-mode={m}
              onClick={() => tab !== m && switchTab(m)}>{label}</button>))}
        </div>
      </div>
      <ImportDialog open={!!importing} preset={importing?.preset} onClose={() => setImporting(null)} onImported={imported} />
      <Reveal fish={reveal?.fish} onOpenFish={setViewing} onClose={() => { if (reveal) setNotice(reveal.notice); setReveal(null); }} />
      <BaitView id={bait} onClose={() => setBait(null)} />
      <FishView fish={viewing} onClose={() => setViewing(null)} />
      <Toast notice={notice} onDismiss={dismissNotice} />
      <footer className="credit">created with 🐟 by jadedzilla</footer>
    </AppContext.Provider>
  );
}

/** Light / dark mode switch; the choice is remembered. */
function ThemeButton() {
  const toggle = () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    writeRaw(KEYS.theme, next);
  };
  return (
    <button className="theme-btn" id="themeBtn" type="button" aria-label="Switch between light and dark mode" title="Light / dark mode" onClick={toggle}>
      <svg className="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></svg>
      <svg className="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
    </button>
  );
}
