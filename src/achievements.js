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
  const section = /ocean fishing/i.test(a.desc) ? "voyage" : a.order < 40 ? "milestones" : "other";
  return { kind: "manual", section };
}

/** Whether an achievement is obtained. ctx: { reqs: Map(id → requirement), byAch: Map(id → achievement), isCaught, marks }. */
export function achievementDone(a, ctx, seen = new Set()) {
  const r = ctx.reqs.get(a.id);
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
  ["ocean", "Ocean fishing log", "Tracked from the ocean fish you've marked caught."],
  ["milestones", "Fishing milestones", "The app can't count casts — mark these obtained yourself."],
  ["voyage", "Ocean fishing voyages", "Voyage scores and bonuses aren't tracked — mark these obtained yourself."],
  ["other", "Other", "Not tracked — mark these obtained yourself."],
];

/**
 * Render the Achievements page into `root`.
 * deps: { allFish: [fish…], byId: Map, isCaught(id), fishIcon(f), onOpen(f), esc(s), marks: Set, saveMarks(set) }.
 * Returns { show(), hide() }.
 */
export function createAchievements(root, { allFish, byId, isCaught, fishIcon, onOpen, esc, marks, saveMarks }) {
  root.innerHTML = `
    <div class="ac-head">
      <div class="ac-summary" id="acSummary"></div>
      <label class="tm-opt"><input type="checkbox" id="acHideDone"> Hide obtained</label>
    </div>
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
    } else if (r.kind === "meta") {
      const all = byAch();
      progress = `<div class="ac-reqs">Requires: ${r.ids.map(id => { const x = all.get(id);
        return `<span class="${x && isDone(x) ? "ok" : ""}">${esc(x?.name ?? `achievement ${id}`)}${x && isDone(x) ? " ✓" : ""}</span>`; }).join(", ")}</div>`;
    } else {
      status = `<label class="ac-mark"><input type="checkbox" data-mark="${a.id}"${done ? " checked" : ""}> Obtained</label>`;
    }
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
    list.innerHTML = SECTIONS.map(([key, title, note]) => {
      const items = data.achievements.filter(a => sectionOf(a) === key);
      if (!items.length) return "";
      const got = items.filter(a => done.get(a.id)).length;
      const shown = items.filter(a => !hideDone || !done.get(a.id));
      return `<details class="ac-section" data-section="${key}"${expanded.has(key) ? " open" : ""}>
        <summary><h3>${title} <span class="ac-count">${got} / ${items.length}</span></h3></summary>
        <div class="ac-note">${note}</div>
        ${shown.length ? shown.map(a => rowHtml(a, done.get(a.id))).join("") : `<div class="ac-all">All obtained.</div>`}
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
