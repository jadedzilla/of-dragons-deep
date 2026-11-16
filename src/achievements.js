// Achievements page: every Fisher achievement (XIVAPI Achievement rows in AchievementCategory 34), its requirement
// and progress. Progress is worked out from the caught fish where the game's requirement is about which fish you've
// caught; achievements that count things the app can't see (casts, points, voyages…) can be marked obtained by hand.
//
// Requirements come from the Achievement row: Type 1 = a game counter (Key) reaching Data[0]; Type 2 = all of the
// achievements Key + Data[]; Type 27 = every fish at an ocean fishing spot (the Denizens/Specters series).
// Counters we can compute (checked against the game's numbers: the top tiers equal our counts exactly):
//   202  unique fish recorded (Fish Guide + spearfishing log)
//   267  big fish from A Realm Reborn, Heavensward and Stormblood areas (204)
//   826  big fish from Shadowbringers areas (45) · 1000 Endwalker (40) · 1145 Dawntrail (46)
// Ocean spots: IKDSpot rows give each route stop's normal (SpotMain) and spectral (SpotSub) FishingSpot and its fish;
// the achievement's description names the stop and whether the spectral current is present.

import { XIVAPI, XIVAPI_SCHEMA } from "./fishsource.js";
import { xivAsset } from "./teamcraft.js";

const FISHER_CATEGORY = 34;
const UNIQUE_FISH = 202;
const BIG_FISH_COUNTERS = { 267: [0, 1, 2], 826: [3], 1000: [4], 1145: [5] }; // counter → expansions (categories)

const refValue = v => (v && typeof v === "object" ? v.value ?? v.row_id : v);

/** Resolves to { achievements: [{ id, name, desc, points, icon, order, type, key, data }], oceanSpots: [...] }. */
export async function loadAchievements({ fetchFn = fetch, signal } = {}) {
  const schema = `schema=${encodeURIComponent(XIVAPI_SCHEMA)}`;
  const get = async url => {
    const r = await fetchFn(url, { signal });
    if (!r.ok) throw new Error(`XIVAPI HTTP ${r.status}`);
    return r.json();
  };
  const results = [];
  let page = await get(`${XIVAPI}/search?sheets=Achievement&query=${encodeURIComponent(`AchievementCategory=${FISHER_CATEGORY}`)}`
    + `&limit=500&fields=Name,Description,Points,Type,Key,Data,Order,Icon&${schema}`);
  results.push(...page.results);
  while (page.next) { page = await get(`${XIVAPI}/search?cursor=${encodeURIComponent(page.next)}&limit=500`); results.push(...page.results); }

  const spots = await get(`${XIVAPI}/sheet/IKDSpot?limit=500&fields=PlaceName.Name,SpotMain.PlaceName.Name,SpotMain.Item[].Name,SpotSub.Item[].Name&${schema}`);
  const fishOf = spot => (spot?.fields?.Item ?? []).map(i => i.row_id).filter(id => id > 0);
  const oceanSpots = spots.rows.filter(r => r.row_id > 0).map(r => ({
    // names as the descriptions use them: "outer Galadion Bay", "the Ruby Sea" → lower case, without a leading "the"
    names: [r.fields.PlaceName?.fields?.Name, r.fields.SpotMain?.fields?.PlaceName?.fields?.Name]
      .filter(Boolean).map(n => n.toLowerCase().replace(/^the /, "")),
    main: fishOf(r.fields.SpotMain), sub: fishOf(r.fields.SpotSub),
  }));

  const achievements = results.map(({ row_id, fields: f }) => ({
    id: row_id, name: f.Name, desc: f.Description, points: f.Points, order: f.Order, type: refValue(f.Type),
    key: refValue(f.Key), data: (f.Data ?? []).map(refValue).filter(v => v > 0),
    icon: f.Icon?.path_hr1 ? xivAsset(f.Icon.path_hr1) : f.Icon?.path ? xivAsset(f.Icon.path) : null,
  })).sort((a, b) => a.order - b.order || a.id - b.id);
  return { achievements, oceanSpots };
}

/** The ocean stop an achievement's description names (the longest matching name wins), or null. */
function oceanSpotFor(desc, oceanSpots) {
  const d = desc.toLowerCase();
  let best = null, bestLen = 0;
  for (const s of oceanSpots) for (const n of s.names) if (n.length > bestLen && d.includes(n)) { best = s; bestLen = n.length; }
  return best;
}

/* ---------- Import from the Of Dragons Deep plugin (Achievements tab export) ---------- */
// Formats (github.com/jadedzilla/of-dragons-deep-plugin, Exporter.ExportAchievements):
//   JSON  {"source":"OfDragonsDeep","category":"Fisher","achievements":[{"id","name","points","complete","current","max"}…]}
//   CSV   id,name,points,complete,current,max          (one row per achievement; names quoted when needed)
//   IDs   completed achievement ids, comma separated    (only says what's complete)
//   List  "[x] Name" / "[ ] Name (312/500)" per line    (matched by name, so the client language must be English)
// JSON, CSV and the list cover the whole category, so they also say what's NOT complete; IDs only add.

/** True for text that is an achievements export (so the fish Import can point people to the right place). */
export function looksLikeAchievementExport(text) {
  const t = text.trim();
  return /^\{[\s\S]*"achievements"\s*:/.test(t) || /^id,name,points,complete/i.test(t) || /^\[[x ]\] /im.test(t);
}

/**
 * Parse a plugin achievements export. Returns { entries: [{ id, complete, current?, max? }], full, unknown: [...],
 * error? } — full = the export lists every achievement (so ones marked incomplete should be unmarked).
 */
export function parseAchievementExport(text, achievements) {
  const t = text.trim(), byId = new Map(achievements.map(a => [a.id, a]));
  const num = v => (v === null || v === undefined || v === "" ? undefined : Number(v));
  const result = (rows, full) => {
    const entries = [], unknown = [];
    for (const r of rows) (byId.has(r.id) ? entries.push(r) : unknown.push(r.label ?? r.id));
    return { entries, unknown, full };
  };
  if (!t) return { entries: [], unknown: [], full: false, error: "Paste an export first." };
  if (t.startsWith("{")) {
    let data;
    try { data = JSON.parse(t); } catch { return { entries: [], unknown: [], full: false, error: "This JSON couldn't be read. It may have been cut off when it was copied." }; }
    if (!Array.isArray(data.achievements)) {
      return { entries: [], unknown: [], full: false, error: Array.isArray(data.fish)
        ? "This is a <b>fish</b> export. Import it with Import on the Fish Guide page." : "This JSON has no achievements in it." };
    }
    return result(data.achievements.map(a => ({ id: Number(a.id), label: a.name ?? a.id, complete: !!a.complete,
      current: num(a.current), max: num(a.max) })), true);
  }
  if (/^id,name,points,complete/i.test(t)) {
    const rows = [];
    for (const line of t.split(/\r?\n/).slice(1)) {
      if (!line.trim()) continue;
      const cells = []; // CSV with "quoted, fields"
      for (let i = 0, cell = "", q = false; i <= line.length; i++) {
        const c = line[i];
        if (q) { if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
        else if (c === '"') q = true;
        else if (c === "," || c === undefined) { cells.push(cell); cell = ""; }
        else cell += c;
      }
      const [id, name, , complete, current, max] = cells;
      rows.push({ id: Number(id), label: name || id, complete: complete === "true", current: num(current), max: num(max) });
    }
    return result(rows, true);
  }
  if (/^\[[x ]\] /im.test(t)) {
    const byName = new Map(achievements.map(a => [a.name.toLowerCase(), a.id]));
    const rows = [];
    for (const line of t.split(/\r?\n/)) {
      const m = /^\[([x ])\]\s+(.*?)(?:\s+\((\d+)\/(\d+)\))?\s*$/i.exec(line.trim());
      if (!m) continue;
      rows.push({ id: byName.get(m[2].toLowerCase()) ?? -1, label: m[2], complete: m[1].toLowerCase() === "x", current: num(m[3]), max: num(m[4]) });
    }
    return result(rows, true);
  }
  const tokens = t.split(/[\s,;]+/).filter(Boolean);
  if (tokens.some(x => !/^\d+$/.test(x))) return { entries: [], unknown: [], full: false, error: "This doesn't look like an achievements export from the plugin." };
  return result(tokens.map(x => ({ id: +x, complete: true })), false);
}

let achievementsPromise = null; // loaded once (dropped on failure so it can be retried)
export function getAchievements() {
  achievementsPromise ??= loadAchievements().catch(e => { achievementsPromise = null; throw e; });
  return achievementsPromise;
}

/**
 * What an achievement needs: { kind: "count", section, need, fish } (any `need` of `fish`), { kind: "set", section,
 * fish } (all of them), { kind: "meta", ids } (all those achievements) or { kind: "manual", section }.
 */
export function achievementRequirement(a, data, allFish, byId) {
  if (a.type === 1 && a.key === UNIQUE_FISH) return { kind: "count", section: "log", need: a.data[0], fish: allFish };
  if (a.type === 1 && BIG_FISH_COUNTERS[a.key]) {
    const cats = BIG_FISH_COUNTERS[a.key];
    return { kind: "count", section: "big", need: a.data[0], fish: allFish.filter(f => !f.spear && f.big && cats.includes(f.cat)) };
  }
  if (a.type === 27) {
    const spot = oceanSpotFor(a.desc, data.oceanSpots);
    if (spot) {
      const ids = /current is present/i.test(a.desc) ? spot.sub : spot.main;
      return { kind: "set", section: "ocean", fish: ids.map(id => byId.get(id)).filter(Boolean) };
    }
  }
  if (a.type === 2) return { kind: "meta", ids: [a.key, ...a.data] };
  const section = /ocean fishing/i.test(a.desc) ? "ocean" : a.order < 40 ? "milestones" : "other"; // voyages join the ocean section
  return { kind: "manual", section };
}

/** Whether an achievement is obtained. ctx: { reqs: Map(id → requirement), byAch: Map(id → achievement), isCaught, marks }. */
export function achievementDone(a, ctx, seen = new Set()) {
  const r = ctx.reqs.get(a.id);
  if (ctx.marks.has(a.id)) return true; // ticked by hand, or reported complete by the game (plugin import)
  if (r.kind === "count") return r.fish.filter(f => ctx.isCaught(f.id)).length >= r.need;
  if (r.kind === "set") return r.fish.length > 0 && r.fish.every(f => ctx.isCaught(f.id));
  if (r.kind === "meta") {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return r.ids.every(id => ctx.byAch.has(id) ? achievementDone(ctx.byAch.get(id), ctx, seen) : ctx.marks.has(id));
  }
  return ctx.marks.has(a.id);
}

const SECTIONS = [
  ["log", "Fish log", "Tracked from the fish you've marked caught (Fish Guide and spearfishing log)."],
  ["big", "Big fish", "Tracked from the big fish you've marked caught."],
  ["ocean", "Ocean Fishing", "Spot achievements (Denizens/Specters) are tracked from the ocean fish you've marked caught; voyage scores and bonuses aren't — mark those obtained yourself."],
  ["milestones", "Fishing milestones", "The app can't count casts — mark these obtained yourself."],
  ["other", "Other", "Not tracked — mark these obtained yourself."],
];

/**
 * Render the Achievements page into `root`.
 * deps: { allFish: [fish…], byId: Map, isCaught(id), fishIcon(f), onOpen(f), esc(s), marks: Set, saveMarks(set) }.
 * Returns { show(), hide() }.
 */
export function createAchievements(root, { allFish, byId, isCaught, fishIcon, onOpen, esc, marks, saveMarks, progress: imported, saveProgress }) {
  root.innerHTML = `
    <div class="ac-head">
      <div class="ac-summary" id="acSummary"></div>
      <div class="ac-tools">
        <label class="tm-opt"><input type="checkbox" id="acHideDone"> Hide obtained</label>
        <button type="button" class="btn small" id="acImportBtn" title="Import your achievements from the Of Dragons Deep plugin">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 16h2V6.8l3.3 3.3 1.4-1.4L12 3 6.3 8.7l1.4 1.4L11 6.8zM4 18h16v2H4z"/></svg> Import</button>
      </div>
    </div>
    <div class="ac-imported" id="acImported"></div>
    <div class="ac-list" id="acList"><div class="empty-msg">Loading achievements…</div></div>
    <div class="tm-credit">Achievements from XIVAPI game data. Fish-based progress comes from the fish you've marked caught;
      everything else can be marked obtained by hand (saved in this browser).</div>`;
  const $a = s => root.querySelector(s);
  const list = $a("#acList");
  let data = null, loading = null, reqs = new Map();
  // Sections start collapsed; click a heading to expand it. Which ones are open is remembered in this browser.
  const OPEN_KEY = "odd-achievements-open";
  const expanded = new Set((() => { try { return JSON.parse(localStorage.getItem(OPEN_KEY) || "[]"); } catch { return []; } })());
  list.addEventListener("toggle", e => {
    const key = e.target.dataset?.section;
    if (!key) return;
    if (e.target.open) expanded.add(key); else expanded.delete(key);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify([...expanded])); } catch { /* storage unavailable */ }
  }, true); // toggle doesn't bubble

  const byAch = () => new Map(data.achievements.map(a => [a.id, a]));
  const isDone = a => achievementDone(a, { reqs, byAch: byAch(), isCaught, marks });

  function rowHtml(a, done) {
    const r = reqs.get(a.id);
    let progress = "", status = done ? `<span class="ac-done">✓ Obtained</span>` : "";
    if (r.kind === "count" || r.kind === "set") {
      const need = r.kind === "count" ? r.need : r.fish.length;
      const have = Math.min(need, r.fish.filter(f => isCaught(f.id)).length);
      progress = `<div class="ac-progress"><div class="ac-bar"><i style="width:${need ? (have / need) * 100 : 0}%"></i></div><span>${have.toLocaleString("en-US")} / ${need.toLocaleString("en-US")}</span></div>`;
      if (r.kind === "set") progress += `<div class="ac-fish">${r.fish.map(f => `<button type="button" class="ac-f${isCaught(f.id) ? " caught" : ""}" data-fish="${f.id}" title="${esc(f.name)}${isCaught(f.id) ? " ✓" : ""}">${fishIcon(f)}</button>`).join("")}</div>`;
    } else if (r.kind === "meta") { // its parts are listed underneath it (see render)
      const all = byAch(), have = r.ids.filter(id => all.has(id) ? isDone(all.get(id)) : marks.has(id)).length, need = r.ids.length;
      progress = `<div class="ac-progress"><div class="ac-bar"><i style="width:${(have / need) * 100}%"></i></div><span>${have} / ${need} achievements</span></div>`;
    } else {
      status = `<label class="ac-mark"><input type="checkbox" data-mark="${a.id}"${done ? " checked" : ""}> Obtained</label>`;
      const pr = imported.items[a.id];
      if (pr && !done && pr[1] > 0) {
        progress = `<div class="ac-progress" title="From your last plugin import"><div class="ac-bar"><i style="width:${Math.min(100, (pr[0] / pr[1]) * 100)}%"></i></div><span>${pr[0].toLocaleString("en-US")} / ${pr[1].toLocaleString("en-US")} <span class="ac-src">in game</span></span></div>`;
      }
    }
    if (done && r.kind !== "manual" && marks.has(a.id)) status = `<span class="ac-done" title="Reported complete by the game (plugin import)">✓ Obtained</span>`;
    return `<div class="ac-row${done ? " done" : ""}" data-id="${a.id}">
      <span class="ac-icon">${a.icon ? `<img src="${esc(a.icon)}" alt="" loading="lazy">` : ""}</span>
      <div class="ac-main">
        <div class="ac-name">${esc(a.name)} <span class="ac-pts" title="Achievement points">${a.points}</span></div>
        <div class="ac-desc">${esc(a.desc)}</div>${progress}
      </div>
      <div class="ac-status">${status}</div>
    </div>`;
  }

  function render() {
    if (!data) return;
    const hideDone = $a("#acHideDone").checked, all = byAch();
    const sectionOf = a => {
      const r = reqs.get(a.id);
      if (r.kind !== "meta") return r.section;
      // a meta achievement goes with what it requires ("No River Wide Enough" → Big fish)
      const parts = r.ids.map(id => all.get(id)).filter(Boolean).map(sectionOf);
      return parts[0] ?? "other";
    };
    const done = new Map(data.achievements.map(a => [a.id, isDone(a)]));
    const nDone = [...done.values()].filter(Boolean).length;
    const pts = data.achievements.reduce((s, a) => s + a.points, 0), ptsDone = data.achievements.reduce((s, a) => s + (done.get(a.id) ? a.points : 0), 0);
    $a("#acSummary").innerHTML = `<b>${nDone}</b> of ${data.achievements.length} obtained · <b>${ptsDone}</b> of ${pts} points`;
    $a("#acImported").textContent = imported.at ? `Last imported from the plugin ${new Date(imported.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.` : "";
    // Achievements obtained by completing other achievements are shown as a group: the meta achievement with its parts
    // nested underneath (recursively — "A Fisher's Life for Me: Greater Eorzea" holds the three region ones). A part is
    // listed only inside its group, not on its own.
    const parentOf = new Map();
    for (const a of data.achievements) {
      const r = reqs.get(a.id);
      if (r.kind === "meta") for (const id of r.ids) if (all.has(id) && !parentOf.has(id)) parentOf.set(id, a.id);
    }
    const node = (a, depth) => {
      if (hideDone && done.get(a.id)) return "";
      const r = reqs.get(a.id), row = rowHtml(a, done.get(a.id));
      if (r.kind !== "meta") return depth ? row.replace('class="ac-row', 'class="ac-row ac-sub') : row;
      const parts = r.ids.map(id => all.get(id)).filter(Boolean).map(x => node(x, depth + 1)).join("");
      return `<div class="ac-group${depth ? " ac-sub" : ""}" data-group="${a.id}">${row}${parts ? `<div class="ac-children">${parts}</div>` : ""}</div>`;
    };
    list.innerHTML = SECTIONS.map(([key, title, note]) => {
      const items = data.achievements.filter(a => sectionOf(a) === key);
      if (!items.length) return "";
      const got = items.filter(a => done.get(a.id)).length;
      const roots = items.filter(a => !parentOf.has(a.id));
      const html = roots.map(a => node(a, 0)).join("");
      return `<details class="ac-section" data-section="${key}"${expanded.has(key) ? " open" : ""}>
        <summary><h3>${title} <span class="ac-count">${got} / ${items.length}</span></h3></summary>
        <div class="ac-note">${note}</div>
        ${html || `<div class="ac-all">All obtained.</div>`}
      </details>`;
    }).join("");
  }

  function load() {
    loading ??= getAchievements().then(d => {
      data = d;
      reqs = new Map(d.achievements.map(a => [a.id, achievementRequirement(a, d, allFish, byId)]));
      render();
    }, err => {
      loading = null;
      list.innerHTML = `<div class="empty-msg">Couldn't load the achievements (${esc(err.message)}). <button type="button" class="btn" id="acRetry">Try again</button></div>`;
      $a("#acRetry").addEventListener("click", () => { list.innerHTML = `<div class="empty-msg">Loading achievements…</div>`; load(); });
    });
    return loading;
  }

  // ---------- Import from the plugin ----------
  const dialog = document.createElement("dialog");
  dialog.className = "import-dialog";
  dialog.id = "acImportDialog";
  dialog.innerHTML = `
    <form method="dialog" id="acImportForm">
      <h2>Import achievements</h2>
      <p class="hint">In game, open the <b>Of Dragons Deep</b> plugin (<code>/dragonsdeep</code>) → <b>Achievements</b> →
        <b>Load achievements</b> (tick <i>Include progress</i> for counts like 312/500) → <b>Copy to clipboard</b>, then paste here.
        JSON (recommended), CSV, the checklist or the list of IDs all work.</p>
      <textarea id="acImportText" rows="6" placeholder='{"source":"OfDragonsDeep","category":"Fisher","achievements":[…]}' spellcheck="false"></textarea>
      <label class="file-pick">or load a .json / .csv / .txt file <input type="file" id="acImportFile" accept=".json,.csv,.txt,application/json,text/csv,text/plain"></label>
      <div class="import-result" id="acImportResult" role="status"></div>
      <div class="actions">
        <button type="button" class="btn" id="acImportClose">Close</button>
        <button type="submit" class="btn primary" id="acImportGo">Import</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);
  const $d = s => dialog.querySelector(s), go = $d("#acImportGo"), text = $d("#acImportText");
  let confirmUnmark = false;
  const resetGo = () => { confirmUnmark = false; go.textContent = "Import"; go.classList.remove("danger"); };
  const showImport = (html, kind) => { const r = $d("#acImportResult"); r.innerHTML = html; r.className = "import-result" + (kind ? " " + kind : ""); };
  const sample = (arr, n = 8) => esc(arr.slice(0, n).join(", ")) + (arr.length > n ? `, … (+${arr.length - n} more)` : "");
  root.querySelector("#acImportBtn").addEventListener("click", () => { resetGo(); showImport(""); dialog.showModal(); text.focus(); });
  $d("#acImportClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  text.addEventListener("input", resetGo);
  $d("#acImportFile").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    text.value = await file.text();
    e.target.value = "";
    resetGo();
    showImport(`Loaded <b>${esc(file.name)}</b>. Click Import to apply.`);
  });
  $d("#acImportForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!data) { try { await load(); } catch { /* handled by load */ } }
    if (!data) { showImport("The achievement list hasn't loaded yet. Try again in a moment.", "warn"); return; }
    const res = parseAchievementExport(text.value, data.achievements);
    if (res.error) { showImport(res.error, "warn"); return; }
    if (!res.entries.length) { showImport(`None of these are Fisher achievements, so nothing was changed.${res.unknown.length ? `<div class="sub">Not recognised: ${sample(res.unknown)}</div>` : ""}`, "warn"); return; }
    // a full export says what's not complete too: those lose their "Obtained" mark (needs a second click)
    const unmark = res.full ? res.entries.filter(x => !x.complete && marks.has(x.id)) : [];
    if (unmark.length && !confirmUnmark) {
      confirmUnmark = true;
      go.textContent = `Unmark ${unmark.length} & import`;
      go.classList.add("danger");
      showImport(`The game says <b>${unmark.length}</b> achievement${unmark.length > 1 ? "s" : ""} you've marked obtained ${unmark.length > 1 ? "aren't" : "isn't"} complete:
        ${sample(unmark.map(x => data.achievements.find(a => a.id === x.id)?.name ?? x.id))}. Click the button again to unmark ${unmark.length > 1 ? "them" : "it"} and import.`, "warn");
      return;
    }
    let added = 0, withProgress = 0;
    for (const x of res.entries) {
      if (x.complete) { if (!marks.has(x.id)) added++; marks.add(x.id); delete imported.items[x.id]; continue; }
      if (res.full) marks.delete(x.id);
      if (x.current !== undefined && x.max) { imported.items[x.id] = [x.current, x.max]; withProgress++; }
      else delete imported.items[x.id];
    }
    imported.at = new Date().toISOString();
    saveMarks(marks); saveProgress(imported);
    resetGo();
    render();
    const complete = res.entries.filter(x => x.complete).length;
    const said = [
      complete ? `Imported <b>${complete}</b> completed achievement${complete === 1 ? "" : "s"}` + (added !== complete ? ` (${added} new)` : "") + "." : "",
      unmark.length ? `Unmarked <b>${unmark.length}</b>.` : "",
      withProgress ? `Imported progress for <b>${withProgress}</b> unfinished achievement${withProgress === 1 ? "" : "s"}.` : "",
    ].filter(Boolean);
    showImport((said.join(" ") || "Nothing to change.")
      + (res.full ? "" : `<div class="sub">This was a list of IDs, so only completions were added. Use the JSON export to also get progress.</div>`)
      + (res.unknown.length ? `<div class="sub">Skipped ${res.unknown.length} not in this list: ${sample(res.unknown)}</div>` : ""), "ok");
  });

  root.addEventListener("change", e => {
    if (e.target.matches("#acHideDone")) return render();
    const id = +e.target.dataset?.mark;
    if (!id) return;
    if (e.target.checked) marks.add(id); else marks.delete(id);
    saveMarks(marks);
    render();
  });
  list.addEventListener("click", e => { const b = e.target.closest(".ac-f"); if (b) onOpen(byId.get(+b.dataset.fish)); });

  return {
    show() { if (data) render(); else load(); },
    hide() {},
    refresh() { render(); },
  };
}
