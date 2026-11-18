import { loadFish, CATEGORIES, OCEAN_FISHING } from "./data.js";
import { skeleton, skInline } from "./skeleton.js";
import { fishIcon, fishPlaceholder, loadIcons, prefetchSheets, sheetsFor, sheetsReady, sheetCount } from "./icons.js";
import { loadCaught, saveCaught, loadTab, saveTab, loadMarks, saveMarks, loadAchievementProgress, saveAchievementProgress } from "./storage.js";
import { XIVAPI, XIVAPI_SCHEMA } from "./fishsource.js";
import { createTimers } from "./timers.js";
import { createAchievements } from "./achievements.js";
import { createLogRoute } from "./logroute.js";
import { createShare } from "./share.js";
import { initBaitView } from "./baits.js";
import { createGacha } from "./gacha.js";
import { baitChains, hooksetAndTug, loadTeamcraft, xivAsset, xivRows } from "./teamcraft.js";

const PER_PAGE = 100; // 10x10 grid

const $ = s => document.querySelector(s);
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const grid = $("#grid"), pagesEl = $("#pages"), tip = $("#tooltip");

/* ---------- Data and state ---------- */
const [{ fish: FISH_LIST, spear: SPEAR_LIST, live, fetched, patch, error }] = await Promise.all([loadFish(), loadIcons()]);
// Two lists, switched with the tabs under the window: the Fish Guide and the spearfishing log.
// Caught state, lookups and Import cover both (their item ids never overlap).
const LISTS = { fish: FISH_LIST, spear: SPEAR_LIST };
let mode = loadTab() === "spear" && SPEAR_LIST.length ? "spear" : "fish";
let FISH = LISTS[mode]; // the list currently shown
const ALL_FISH = [...FISH_LIST, ...SPEAR_LIST];
const BY_ID = new Map(ALL_FISH.map(f => [f.id, f]));
const caught = loadCaught(new Set(BY_ID.keys()));
const isCaught = id => caught.has(id);
const countCaught = list => list.reduce((n, f) => n + caught.has(f.id), 0);

const allCats = () => new Set(CATEGORIES.map((_, i) => i));
const filters = { status: "all", cats: allCats(), bigOnly: false, collOnly: false };
let page = 0, query = "";
let hasBig = true; // whether the current list has big fish (spearfishing doesn't)

/* ---------- Tabs ---------- */
// Category checkboxes for the current list (categories it doesn't use are hidden; their state is kept).
// Lists without big fish (spearfishing) also hide "Big fish only" and the legend entry; the setting is kept for later.
// The legend entry only turns invisible (keeping its space) so the rest of the legend doesn't move between tabs.
function buildCatFilters() {
  hasBig = FISH.some(f => f.big);
  $("#bigOnly").closest("label").hidden = !hasBig;
  $("#bigLegend").classList.toggle("off", !hasBig);
  $("#expFilters").innerHTML = CATEGORIES.map((c, i) => {
    const n = FISH.filter(f => f.cat === i).length;
    return n ? `<label><input type="checkbox" data-cat="${i}"${filters.cats.has(i) ? " checked" : ""}> ${c} <span class="n">${n}</span></label>` : "";
  }).join("");
}
function updateNote() {
  const what = mode === "spear" ? "spearfish" : "fish";
  $("#dataNote").textContent = live
    ? `${FISH.length} ${what} · live game data from XIVAPI${patch ? ` (patch ${patch})` : ""}`
    : `${FISH.length} ${what} · offline snapshot from ${fetched}${patch ? `, patch ${patch}` : ""} (couldn't reach XIVAPI: ${error})`;
  $("#dataNote").classList.toggle("offline", !live);
}
const tabs = document.querySelectorAll("#tabs .tab");
function setMode(m) {
  mode = m; FISH = LISTS[m]; page = 0;
  tabs.forEach(t => { const on = t.dataset.mode === m; t.classList.toggle("active", on); t.setAttribute("aria-selected", on); });
  saveTab(m);
  buildCatFilters(); updateNote();
}
tabs.forEach(t => t.addEventListener("click", () => { if (t.dataset.mode !== mode) { setMode(t.dataset.mode); render(); } }));
$("#tabs").hidden = !SPEAR_LIST.length;

/* ---------- Filtering and paging ---------- */
// Filtering keeps the list's order (the game's log order); don't sort.
function visible() {
  const q = query.trim().toLowerCase();
  return FISH.filter(f =>
    (!q || f.name.toLowerCase().includes(q) || f.zone.toLowerCase().includes(q)) &&
    filters.cats.has(f.cat) &&
    (!filters.bigOnly || f.big || !hasBig) &&
    (!filters.collOnly || f.collectable) &&
    (filters.status === "all" || (filters.status === "caught") === caught.has(f.id))
  );
}
const pageOf = (list, n) => list.slice(n * PER_PAGE, (n + 1) * PER_PAGE);

// ‹ first … current±2 … last ›
// Always the same number of slots between the arrows (7 on wide screens, 5 on phones, 3 on very narrow ones, once
// there are more pages than that), and gaps are as wide as buttons, so the arrows don't move when you change page.
const PHONE = matchMedia("(max-width:520px)"), NARROW = matchMedia("(max-width:350px)");
const slotCount = () => (NARROW.matches ? 3 : PHONE.matches ? 5 : 7);
PHONE.addEventListener("change", () => render());
NARROW.addEventListener("change", () => render());
function pageSlots(count) {
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const slots = slotCount(), last = count - 1;
  if (count <= slots) return range(0, last);
  if (slots === 3) return page === 0 || page === last ? [0, null, last] : [null, page, null]; // 1 … N  /  … p …
  const edge = slots - 2;                                                  // pages shown together at either end
  if (page < edge - 1) return [...range(0, edge - 1), null, last];         // 1 2 3 4 5 … N   (phones: 1 2 3 … N)
  if (page > last - edge + 1) return [0, null, ...range(last - edge + 1, last)]; // 1 … N-4 … N
  const mid = slots === 7 ? [page - 1, page, page + 1] : [page];
  return [0, null, ...mid, null, last];                                    // 1 … p-1 p p+1 … N  (phones: 1 … p … N)
}
function pageButtons(count) {
  return [
    { label: "‹", to: page - 1, dis: page === 0, arrow: true },
    ...pageSlots(count).map(p => p === null ? { gap: true } : { label: p + 1, to: p, active: p === page }),
    { label: "›", to: page + 1, dis: page >= count - 1, arrow: true },
  ];
}

/* ---------- Rendering ---------- */
function renderPager(pageCount) {
  pagesEl.innerHTML = "";
  for (const b of pageButtons(pageCount)) {
    if (b.gap) {
      const s = document.createElement("span");
      s.className = "gap"; s.textContent = "…";
      pagesEl.appendChild(s);
      continue;
    }
    const el = document.createElement("button");
    el.type = "button";
    el.className = "pg" + (b.active ? " active" : "") + (b.arrow ? " arrow" : "");
    el.textContent = b.label;
    el.disabled = !!b.dis;
    el.onclick = () => { page = b.to; render(); };
    pagesEl.appendChild(el);
  }
}

function render() {
  const list = visible();
  const pageCount = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (page >= pageCount) page = pageCount - 1;
  renderPager(pageCount);

  const slice = pageOf(list, page);
  if (!list.length) {
    grid.innerHTML = `<div class="empty-msg">No fish match your search.</div>`;
  } else {
    let html = "";
    for (const f of slice) html += `<div class="tile${caught.has(f.id) ? " caught" : ""}${f.big ? " big" : ""}" data-id="${f.id}">${fishIcon(f)}</div>`;
    for (let i = slice.length; i < PER_PAGE; i++) html += `<div class="tile empty"></div>`;
    grid.innerHTML = html;
  }

  $("#caughtCount").textContent = countCaught(FISH);
  $("#totalCount").textContent = FISH.length;
  $("#showing").textContent = list.length === FISH.length ? "" : `${list.length} match`;
  const active = (filters.status !== "all") + (filters.cats.size !== CATEGORIES.length) + (filters.bigOnly && hasBig) + filters.collOnly;
  const fc = $("#filterCount");
  fc.textContent = active;
  fc.classList.toggle("on", active > 0);

  // Once this page's icons are in, get the next and previous pages' sheets ready before they're needed.
  const near = [...pageOf(list, page + 1), ...(page ? pageOf(list, page - 1) : [])];
  sheetsReady(sheetsFor(slice)).then(() => prefetchSheets(sheetsFor(near), { urgent: true }));
}

function showTip(t) {
  const f = BY_ID.get(+t.dataset.id);
  const tags = [f.big ? "Big fish" : "", f.collectable ? "Collectable" : ""].filter(Boolean).join(" · ");
  tip.innerHTML = `<div class="n">${esc(f.name)}</div>
    <div class="m">${esc(f.zone)}${f.zone !== f.region ? ", " + esc(f.region) : ""}</div>
    <div class="m">${f.spear ? "Spearfishing · " : ""}${esc(f.water)}${f.cat !== OCEAN_FISHING ? " · Lv. " + f.lvl : ""} · ${CATEGORIES[f.cat]}</div>
    ${tags ? `<div class="t">${tags}</div>` : ""}
    <div class="m">${caught.has(f.id) ? "✔ Caught" : "Not yet caught"}</div>`;
  const r = t.getBoundingClientRect();
  tip.style.display = "block";
  const w = tip.offsetWidth;
  tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)) + "px";
  tip.style.top = (r.top - tip.offsetHeight - 6 < 0 ? r.bottom + 6 : r.top - tip.offsetHeight - 6) + "px";
}
const hideTip = () => { tip.style.display = "none"; };
// Dialogs close on a click on their backdrop (the dialog element itself, outside its content).
const closeOnBackdrop = d => d.addEventListener("click", e => { if (e.target === d) d.close(); });

/* ---------- Fish detail view ---------- */
// Clicking/tapping a fish while Edit is off opens this view. The in-game item description is fetched from XIVAPI
// on first open (and remembered); everything else comes from the loaded data, so the view works offline too.
const fishDialog = $("#fishDialog");
let viewing = null; // id of the fish shown
const descriptions = new Map(); // item id → Promise<string|null>
function loadDescription(id) {
  if (!descriptions.has(id)) {
    descriptions.set(id, fetch(`${XIVAPI}/sheet/Item/${id}?fields=Description&schema=${encodeURIComponent(XIVAPI_SCHEMA)}`)
      .then(r => r.ok ? r.json() : null).then(d => d?.fields?.Description || null, () => null)
      .then(text => { if (text === null) descriptions.delete(id); return text; })); // retry next time if it failed
  }
  return descriptions.get(id);
}
// Canvas and aquarium notes in the description ("[Suitable for printing on small canvases.]", "[Suitable for
// display in aquariums tier 2 and higher.]") are shown as their own lines in the view, so they're left out here.
const SHOWN_AS_FACTS = /^\[Suitable for (printing on .* canvases|display in aquariums)/;
function renderDescription(el, text) {
  el.replaceChildren();
  if (!text) { el.innerHTML = `<span class="loading">Description unavailable right now.</span>`; return; }
  for (const block of text.split(/\n\n+/)) {
    for (const line of block.split("\n")) {
      if (!line.trim() || SHOWN_AS_FACTS.test(line.trim())) continue;
      const p = document.createElement("div");
      p.textContent = line;
      if (/^\[.*\]$/.test(line.trim())) p.className = "note";
      el.appendChild(p);
    }
  }
}
// Fish prints: the canvas size is only in the item description (there's no canvas table in the game data).
function canvasFrom(text) {
  const m = /printing on (extra large|small|medium|large) canvases/i.exec(text);
  if (m) return m[1][0].toUpperCase() + m[1].slice(1);
  return /Use item to acquire/i.test(text) ? "Can't be printed (minion item)" : "Can't be printed";
}
// Best bait: from Teamcraft's fishing data: the bait, then any fish to mooch with ("or" between baits that all work).
// When it differs between the fish's spots, each set of baits gets its own line with its spots ("other spots" for the most common one when there are many).
// Item and spot names/icons come from XIVAPI, fetched per fish and remembered.
const baitInfo = new Map(); // fish id → Promise<{ groups, items: { id: {name, icon} }, spots: { id: name } }>
function loadBait(id) {
  if (!baitInfo.has(id)) {
    baitInfo.set(id, loadTeamcraft("fishing-sources").then(async sources => {
      const groups = baitChains(sources, id);
      const multi = groups.length > 1;
      const [itemRows, spotRows] = await Promise.all([
        groups.length ? xivRows("Item", groups.flatMap(g => g.chains.flat()), "Name,Icon") : [],
        multi ? xivRows("FishingSpot", groups.flatMap(g => g.spots), "PlaceName.Name") : [],
      ]);
      const items = Object.fromEntries(itemRows.map(r => [r.row_id, { name: r.fields.Name, icon: r.fields.Icon?.path ? xivAsset(r.fields.Icon.path) : null }]));
      const spots = Object.fromEntries(spotRows.map(r => [r.row_id, r.fields.PlaceName?.fields?.Name || `Spot ${r.row_id}`]));
      return { groups, items, spots, ...hooksetAndTug(sources, id) };
    }).catch(e => { baitInfo.delete(id); throw e; }));
  }
  return baitInfo.get(id);
}
function baitHtml({ groups, items, spots }) {
  const item = id => {
    const it = items[id] ?? { name: BY_ID.get(id)?.name ?? `Item ${id}` };
    const img = it.icon ? `<img src="${esc(it.icon)}" alt="" loading="lazy" onerror="this.remove()">` : "";
    // a real bait opens where to get it; a fish used as bait (mooch) isn't a bait chip
    return BY_ID.has(id) ? `<span class="fv-bait-item">${img}${esc(it.name)}</span>`
      : `<button type="button" class="fv-bait-item bait-link" data-bait="${id}" title="Where to get ${esc(it.name)}">${img}${esc(it.name)}</button>`;
  };
  const chain = ids => ids.map((id, i) => (i ? `<span class="fv-arrow">→</span> ` : "") + item(id) + (i ? ` <span class="fv-or">(mooch)</span>` : "")).join(" ");
  const alternatives = chains => chains.map(chain).join(` <span class="fv-or">or</span> `);
  if (groups.length === 1) return alternatives(groups[0].chains);
  const elsewhere = groups[0].spots.length > 3; // the most common bait, listed last as "other spots"
  const ordered = elsewhere ? [...groups.slice(1), groups[0]] : groups;
  return ordered.map(g => `<div class="fv-bait-line">${alternatives(g.chains)} <span class="fv-spots">${elsewhere && g === groups[0]
    ? "at other spots" : "at " + esc([...new Set(g.spots.map(s => spots[s] ?? `Spot ${s}`))].join(", "))}</span></div>`).join("");
}
// Aquariums: AquariumFish size 1–4 (S/M/L/XL) is also the smallest tank tier that holds the fish.
const aquariumText = a => a ? `${a.water}, tier ${a.size} tanks and up (size ${["", "S", "M", "L", "XL"][a.size]})` : "Not suitable";
// Facts filled in once their data arrives (a loading placeholder until then): their <dd> attributes.
const LOADING = Symbol("loading");
const LATER = { Canvas: ` id="fvCanvas" class="pending"`, "Best bait": ` id="fvBait" class="pending fv-bait"`,
  Hookset: ` id="fvHook" class="pending"`, Tug: ` id="fvTug" class="pending"` };
function openFishView(f) {
  viewing = f.id;
  $("#fvName").textContent = f.name;
  $("#fvIcon").innerHTML = fishIcon(f);
  $("#fvTags").innerHTML = [
    caught.has(f.id) ? `<span class="caught">✓ Caught</span>` : "",
    f.big ? `<span class="big">◆ Big fish</span>` : "",
    f.collectable ? `<span class="coll">Collectable</span>` : "",
    f.spear ? `<span>Spearfishing</span>` : "",
  ].join("");
  const facts = [
    ["Location", f.zone + (f.zone !== f.region ? ", " + f.region : "")],
    [f.spear ? "Size" : "Water", f.water],
    f.cat !== OCEAN_FISHING ? ["Level", String(f.lvl)] : null,
    [f.cat === OCEAN_FISHING ? "Category" : "Expansion", CATEGORIES[f.cat]],
    f.spear ? null : ["Best bait", LOADING], // these three are filled in from Teamcraft's data below
    f.spear ? null : ["Hookset", LOADING],
    f.spear ? null : ["Tug", LOADING],
    ["Aquarium", aquariumText(f.aquarium)],
    ["Canvas", LOADING], // filled in from the description below
    ["Status", caught.has(f.id) ? "Caught" : "Not yet caught"],
    ["Item ID", String(f.id)],
  ].filter(Boolean);
  $("#fvFacts").innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd${LATER[k] ?? ""}>${v === LOADING ? skInline(k === "Best bait" ? "160px" : "84px") : esc(v)}</dd>`).join("");
  const desc = $("#fvDesc");
  desc.innerHTML = skeleton("desc", "Loading description…");
  loadDescription(f.id).then(text => {
    if (viewing !== f.id) return;
    renderDescription(desc, text);
    const canvas = $("#fvCanvas");
    canvas.textContent = text ? canvasFrom(text) : "Unavailable right now";
    canvas.classList.toggle("pending", !text);
  });
  if (!f.spear) loadBait(f.id).then(info => {
    if (viewing !== f.id) return;
    const bait = $("#fvBait"), known = info.groups.length > 0;
    if (known) bait.innerHTML = baitHtml(info); else bait.textContent = "Unknown";
    bait.classList.toggle("pending", !known);
    for (const [sel, value] of [["#fvHook", info.hookset], ["#fvTug", info.tug]]) {
      $(sel).textContent = value ?? "Unknown";
      $(sel).classList.toggle("pending", !value);
    }
  }, () => {
    if (viewing === f.id) for (const sel of ["#fvBait", "#fvHook", "#fvTug"]) $(sel).textContent = "Unavailable right now";
  });
  hideTip();
  if (!fishDialog.open) fishDialog.showModal();
  fishDialog.focus(); // the dialog itself, so the × doesn't show a focus ring on open
}
fishDialog.addEventListener("close", () => { viewing = null; });
$("#fvClose").addEventListener("click", () => fishDialog.close());
closeOnBackdrop(fishDialog);

/* ---------- Edit mode and the grid ---------- */
// Edit mode: clicking a fish only toggles caught while it's on (Import works either way). Always off on page load.
let editing = false;
const editBtn = $("#editBtn");
function setEditing(on) {
  editing = on;
  editBtn.classList.toggle("on", on);
  editBtn.setAttribute("aria-pressed", on);
  grid.classList.toggle("editing", on);
  $("#hint").innerHTML = on ? "<b>Editing:</b> click a fish to mark it caught." : "Turn on <b>Edit</b> to mark fish as caught.";
  $("#bulkBar").hidden = !on;
}
editBtn.addEventListener("click", () => setEditing(!editing));
setEditing(false);

// Edit mode also offers "Mark all caught" / "Mark all uncaught" for the list on the current tab, each confirmed in a
// dialog first (not confirm(), which sandboxed iframes block).
const bulkDialog = $("#bulkDialog");
let bulkAction = null;
function askBulk(markCaught) {
  const tab = mode === "spear" ? "Spearfishing" : "Fishing", noun = mode === "spear" ? "spearfish" : "fish";
  const have = countCaught(FISH), total = FISH.length, n = (markCaught ? total - have : have).toLocaleString("en-US");
  $("#bulkTitle").textContent = markCaught ? `Mark all ${noun} as caught?` : `Mark all ${noun} as uncaught?`;
  $("#bulkText").innerHTML = markCaught
    ? (have === total ? `Every ${noun} on the ${tab} tab is already caught.`
      : have === 0 ? `This marks all <b>${n}</b> ${noun} on the ${tab} tab as caught.`
      : `This marks the remaining <b>${n}</b> ${noun} on the ${tab} tab as caught, so all ${total.toLocaleString("en-US")} will be caught.`)
    : (have === 0 ? `No ${noun} on the ${tab} tab are marked caught.` : `This unmarks all <b>${n}</b> caught ${noun} on the ${tab} tab. It can't be undone (except by marking them again or re-importing).`);
  const go = $("#bulkGo");
  go.hidden = markCaught ? have === total : have === 0;
  go.textContent = markCaught ? "Mark all caught" : "Unmark all";
  go.classList.toggle("danger", !markCaught);
  go.classList.toggle("primary", markCaught);
  $("#bulkCancel").textContent = go.hidden ? "Close" : "Cancel";
  bulkAction = markCaught;
  bulkDialog.showModal();
  $("#bulkCancel").focus(); // the safe choice is focused, so Enter doesn't confirm by accident
}
bulkDialog.addEventListener("close", () => {
  if (bulkDialog.returnValue === "confirm" && bulkAction !== null) {
    for (const f of FISH) bulkAction ? caught.add(f.id) : caught.delete(f.id);
    saveCaught(caught);
    render();
  }
  bulkAction = null;
  bulkDialog.returnValue = "";
});
closeOnBackdrop(bulkDialog);
$("#markAllBtn").addEventListener("click", () => askBulk(true));
$("#unmarkAllBtn").addEventListener("click", () => askBulk(false));

grid.addEventListener("click", e => {
  const t = e.target.closest(".tile[data-id]");
  if (!t) return;
  if (!editing) { openFishView(BY_ID.get(+t.dataset.id)); return; } // view only: open the fish's details
  const id = +t.dataset.id;
  caught.has(id) ? caught.delete(id) : caught.add(id);
  saveCaught(caught);
  render();
  const nt = grid.querySelector(`.tile[data-id="${id}"]`);
  if (nt) showTip(nt); else hideTip();
});
// Icons not in the bundled sheets load from XIVAPI; if that fails, swap in the placeholder.
grid.addEventListener("load", e => { if (e.target.matches?.("img.ic")) e.target.classList.add("ready"); }, true);
grid.addEventListener("error", e => {
  const img = e.target;
  if (!img.matches?.("img.ic")) return;
  const t = img.closest(".tile[data-id]");
  img.outerHTML = fishPlaceholder(BY_ID.get(+t.dataset.id));
}, true);
grid.addEventListener("mouseover", e => { const t = e.target.closest(".tile[data-id]"); if (t) showTip(t); });
grid.addEventListener("mouseleave", hideTip);
window.addEventListener("scroll", hideTip, { passive: true });

/* ---------- Search and filters ---------- */
$("#search").addEventListener("input", e => { query = e.target.value; page = 0; render(); });

const panel = $("#filterPanel"), fbtn = $("#filterBtn");
const closePanel = () => { panel.classList.remove("open"); fbtn.classList.remove("open"); };
fbtn.addEventListener("click", e => { e.stopPropagation(); panel.classList.toggle("open"); fbtn.classList.toggle("open"); });
document.addEventListener("click", e => { if (!panel.contains(e.target) && !fbtn.contains(e.target)) closePanel(); });
panel.addEventListener("change", e => {
  const el = e.target;
  if (el.name === "status") filters.status = el.value;
  else if (el.id === "bigOnly") filters.bigOnly = el.checked;
  else if (el.id === "collOnly") filters.collOnly = el.checked;
  else if (el.dataset.cat) { const c = +el.dataset.cat; el.checked ? filters.cats.add(c) : filters.cats.delete(c); }
  page = 0;
  render();
});
$("#resetFilters").addEventListener("click", () => {
  Object.assign(filters, { status: "all", bigOnly: false, collOnly: false, cats: allCats() });
  panel.querySelectorAll("input").forEach(i => { i.checked = i.type === "radio" ? i.value === "all" : !!i.dataset.cat; });
  page = 0;
  render();
});

/* ---------- Import (fish and achievements) ---------- */
// One dialog for the Fish Guide and Achievements pages. It only takes the Of Dragons Deep plugin's export
// (Copy JSON, or a ?import=2. link decoded into the same JSON):
//   {"source":"OfDragonsDeep","version":2,"fish":[item ids],"achievements":[{"id","complete","current","max"}…]}
// ("achievements" is missing if the plugin couldn't load them). Returns { ids, invalid, achievements } or { error }.
const NOT_EXPORT = "This isn't an export from the Of Dragons Deep plugin. In game, type <code>/dragonsdeep</code>, click <b>Copy JSON</b> and paste it here.";
const OLD_EXPORT = "This is from an older version of the Of Dragons Deep plugin. Update the plugin in game, then copy it again.";
function parseImport(text) {
  const t = text.trim();
  if (!t) return { error: "Paste the plugin's <b>Copy JSON</b> export first." };
  if (!t.startsWith("{")) return { error: NOT_EXPORT };
  let data;
  try { data = JSON.parse(t); } catch { return { error: "This JSON couldn't be read. It may have been cut off when it was copied." }; }
  if (data?.source !== "OfDragonsDeep") return { error: NOT_EXPORT };
  if (data.version !== 2 || !Array.isArray(data.fish)) return { error: OLD_EXPORT };
  const ids = [], invalid = [];
  for (const f of data.fish) (Number.isInteger(f) && f > 0 ? ids.push(f) : invalid.push(String(f)));
  const num = v => (v === null || v === undefined || v === "" ? undefined : Number(v));
  const achievements = Array.isArray(data.achievements)
    ? data.achievements.filter(a => a && Number.isInteger(Number(a.id)))
      .map(a => ({ id: Number(a.id), complete: !!a.complete, current: num(a.current), max: num(a.max) }))
    : null;
  return { ids: [...new Set(ids)], invalid, achievements };
}

const dlg = $("#importDialog"), importText = $("#importText"), importResult = $("#importResult"), importGo = $("#importGo");
let confirmReplace = false; // "replace" needs a second click when it would unmark fish or achievements

function resetImportState() {
  confirmReplace = false;
  importGo.textContent = "Import";
  importGo.classList.remove("danger");
}
function showResult(html, kind) {
  importResult.innerHTML = html;
  importResult.className = "import-result" + (kind ? " " + kind : "");
}
const listSample = (arr, n = 12) => esc(arr.slice(0, n).join(", ")) + (arr.length > n ? `, … (+${arr.length - n} more)` : "");

function openImportDialog() {
  closePanel();
  if (!dlg.open) dlg.querySelector("input[name=importMode][value=replace]").checked = true; // default: replace
  resetImportState();
  showResult("");
  if (!dlg.open) dlg.showModal();
  importText.focus();
}
$("#importBtn").addEventListener("click", openImportDialog);
$("#importCancel").addEventListener("click", () => dlg.close());
closeOnBackdrop(dlg);
importText.addEventListener("input", resetImportState);
dlg.querySelectorAll("input[name=importMode]").forEach(r => r.addEventListener("change", resetImportState));
$("#importForm").addEventListener("submit", e => {
  e.preventDefault();
  const parsed = parseImport(importText.value);
  if (parsed.error) { showResult(parsed.error, "warn"); return; }
  const { ids, invalid, achievements: achIn } = parsed;
  const known = ids.filter(id => BY_ID.has(id)), unknown = ids.filter(id => !BY_ID.has(id));
  const replace = dlg.querySelector("input[name=importMode]:checked").value === "replace";

  if (!known.length && !achIn?.length) {
    showResult(`This export has no caught fish or achievements in it, so nothing was changed.${unknown.length ? `<div class="sub">Not fish: ${listSample(unknown)}</div>` : ""}`, "warn");
    return;
  }

  const knownSet = new Set(known);
  const removed = replace ? [...caught].filter(id => !knownSet.has(id)) : [];
  // Replace also follows the game for achievements: ones marked obtained that the game says aren't complete get unmarked.
  const marks = loadMarks();
  const unmarkAch = replace && achIn ? achIn.filter(a => !a.complete && marks.has(a.id)) : [];
  if (replace && (removed.length || unmarkAch.length) && !confirmReplace) {
    confirmReplace = true;
    const what = [removed.length ? `${removed.length} fish` : "", unmarkAch.length ? `${unmarkAch.length} achievement${unmarkAch.length > 1 ? "s" : ""}` : ""].filter(Boolean);
    importGo.textContent = `Unmark ${what.join(" + ")} & import`;
    importGo.classList.add("danger");
    showResult(`This will <b>unmark ${what.join(" and ")}</b> that ${removed.length + unmarkAch.length > 1 ? "aren't" : "isn't"} in your export. Click the button again to confirm.`, "warn");
    return;
  }

  const fresh = known.filter(id => !caught.has(id)), added = fresh.length; // newly caught: revealed below
  if (replace) caught.clear();
  known.forEach(id => caught.add(id));
  saveCaught(caught);

  // Achievements from a plugin export: completed ones are marked obtained, unfinished ones get the game's progress.
  let achNew = 0, achDone = 0, achProgress = 0;
  if (achIn) {
    const progress = loadAchievementProgress();
    for (const a of achIn) {
      if (a.complete) { achDone++; if (!marks.has(a.id)) achNew++; marks.add(a.id); delete progress.items[a.id]; continue; }
      if (replace) marks.delete(a.id);
      if (a.current !== undefined && a.max) { progress.items[a.id] = [a.current, a.max]; achProgress++; }
      else delete progress.items[a.id];
    }
    progress.at = new Date().toISOString();
    saveMarks(marks);
    saveAchievementProgress(progress);
    achievements?.reloadSaved(marks, progress);
  }

  render();
  resetImportState();

  const parts = [`Marked <b>${added}</b> new fish as caught` + (known.length - added ? ` (${known.length - added} already caught)` : "") + "."];
  if (achIn) parts.push(`<b>${achDone}</b> achievement${achDone === 1 ? "" : "s"} complete` + (achNew ? ` (${achNew} new)` : "")
    + (achProgress ? `, progress for <b>${achProgress}</b> more` : "") + ` (see <a href="#achievements">Achievements</a>).`);
  if (unmarkAch.length) parts.push(`Unmarked <b>${unmarkAch.length}</b> achievement${unmarkAch.length > 1 ? "s" : ""} the game says ${unmarkAch.length > 1 ? "aren't" : "isn't"} complete.`);
  if (removed.length) parts.push(`Unmarked <b>${removed.length}</b> fish not in the export.`);
  parts.push(SPEAR_LIST.length
    ? `You now have <b>${countCaught(FISH_LIST)}</b> / ${FISH_LIST.length} fish and <b>${countCaught(SPEAR_LIST)}</b> / ${SPEAR_LIST.length} spearfish caught.`
    : `You now have <b>${countCaught(FISH_LIST)}</b> / ${FISH_LIST.length} caught.`);
  if (unknown.length) parts.push(`<div class="sub">Skipped ${unknown.length} ID${unknown.length > 1 ? "s that aren't fish" : " that isn't a fish"}: ${listSample(unknown)}</div>`);
  if (invalid.length) parts.push(`<div class="sub">Skipped ${invalid.length} entr${invalid.length > 1 ? "ies that aren't item IDs" : "y that isn't an item ID"}: ${listSample(invalid)}</div>`);
  // Success: close the dialog and show the summary as a short-lived notice instead.
  dlg.close();
  importText.value = "";
  // reveal the newly caught fish, then the summary notice
  gacha.show(fresh.map(id => BY_ID.get(id))).then(() => showToast(parts.join(" "), unknown.length || invalid.length ? 9000 : 5000));
});

// Import summary notice, shown after the dialog closes.
const toast = $("#toast");
let toastTimer;
function showToast(html, ms) {
  toast.innerHTML = html + `<button type="button" class="toast-x" aria-label="Dismiss">×</button>`;
  toast.classList.add("show", "ok");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), ms);
}
toast.addEventListener("click", e => { if (e.target.closest(".toast-x")) { clearTimeout(toastTimer); toast.classList.remove("show"); } });

/* ---------- Import from a link (?import=) ---------- */
// Links from the Of Dragons Deep plugin's Copy tracker link: ?import=2.<data>, where <data> is base64url (no padding) of
// raw-DEFLATE'd LEB128 varints: fish count + sorted item id deltas; then, if present, achievement count + per
// achievement (sorted by id) the id delta and a status: 0 not complete, 1 complete, 2 not complete + current + max.
// Decoded into the plugin's JSON so it goes through the same Import as a pasted export.
async function decodeImportParam(value) {
  if (/^1\.|^[\d\s,;]+$/.test(value)) throw Object.assign(new Error("old"), { old: true });
  const m = /^2\.([A-Za-z0-9_-]*)$/.exec(value);
  if (!m) throw new Error("Unrecognised import link");
  const bytes = Uint8Array.from(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  const nums = [];
  let cur = 0, shift = 0;
  for (const b of raw) {
    cur += (b & 0x7f) * 2 ** shift;
    if (b & 0x80) { shift += 7; continue; }
    nums.push(cur);
    cur = 0; shift = 0;
  }
  let i = 0;
  const next = () => { if (i >= nums.length) throw new Error("Import link is cut off"); return nums[i++]; };
  const fish = [];
  for (let n = next(), prev = 0; n > 0; n--) fish.push(prev += next());
  const out = { source: "OfDragonsDeep", version: 2, fish };
  if (i < nums.length) {
    out.achievements = [];
    for (let n = next(), prev = 0; n > 0; n--) {
      const id = (prev += next()), status = next();
      if (status === 2) out.achievements.push({ id, complete: false, current: next(), max: next() });
      else out.achievements.push({ id, complete: status === 1 });
    }
  }
  return JSON.stringify(out);
}

const linkParams = new URLSearchParams(location.search);
if (linkParams.has("import")) {
  const value = linkParams.get("import");
  // Drop the parameter so reloading or bookmarking the page doesn't import again.
  linkParams.delete("import");
  const rest = linkParams.toString();
  history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);

  openImportDialog();
  try {
    importText.value = await decodeImportParam(value);
    const p = parseImport(importText.value);
    const n = p.ids.filter(id => BY_ID.has(id)).length;
    const ach = p.achievements ? ` and <b>${p.achievements.filter(a => a.complete).length}</b> completed achievements` : "";
    // Nothing is changed until the Import button is pressed.
    showResult(`Loaded <b>${n}</b> fish${ach} from your link. Click <b>Import</b> to replace your current data with it, or choose Add.`);
  } catch (err) {
    showResult(err.old ? OLD_EXPORT : "This import link couldn't be read. It may have been cut off when it was copied.", "warn");
  }
}

/* ---------- Pages: Fish Guide / Fish Timers / Achievements / Log Route / Share (navigation bar; #timers, #achievements, #route, #share) ---------- */
let timers = null, achievements = null, logRoute = null, share = null; // created the first time their page is opened
const VIEWS = { "#timers": "timers", "#achievements": "achievements", "#route": "route", "#share": "share" };
function route() {
  const view = VIEWS[location.hash] ?? "guide";
  document.body.dataset.view = view;
  for (const v of ["guide", "timers", "achievements", "route", "share"]) $(`#${v}View`).hidden = view !== v;
  $("#tabs").hidden = view !== "guide" || !SPEAR_LIST.length;
  $(".progress").hidden = view !== "guide";
  document.querySelectorAll("#topnav a").forEach(a => a.toggleAttribute("aria-current", a.dataset.view === view));
  hideTip(); closePanel();
  if (view === "timers") {
    timers ??= createTimers($("#timersView"), { byId: BY_ID, isCaught, fishIcon, onOpen: openFishView, esc });
    timers.show();
  } else timers?.hide();
  if (view === "achievements") {
    achievements ??= createAchievements($("#achievementsView"), { allFish: ALL_FISH, byId: BY_ID,
      isCaught, fishIcon, onOpen: openFishView, esc, marks: loadMarks(), saveMarks,
      progress: loadAchievementProgress(), openImport: openImportDialog });
    achievements.show();
  }
  if (view === "route") {
    logRoute ??= createLogRoute($("#routeView"), { fishList: FISH_LIST, byId: BY_ID, isCaught,
      markCaught: id => { caught.add(id); saveCaught(caught); }, fishIcon, onOpen: openFishView, esc, oceanCategory: OCEAN_FISHING });
    logRoute.show();
  } else logRoute?.hide();
  if (view === "share") {
    share ??= createShare($("#shareView"), { fishList: FISH_LIST, spearList: SPEAR_LIST, allFish: ALL_FISH, byId: BY_ID,
      isCaught, categories: CATEGORIES, oceanCategory: OCEAN_FISHING });
    share.show();
  }
  if (view === "guide") render();
}
window.addEventListener("hashchange", route);

initBaitView({ esc }); // clicking a bait anywhere shows where to get it
const gacha = createGacha({ fishIcon, esc }); // gacha-style reveal of new fish after an import

/* ---------- Start ---------- */
setMode(mode);
route(); // shows the page in the address (and draws the grid when it's the Fish Guide)

// Then, once the first page is showing, quietly load the remaining sheets (≈1.7 MB in all) so every page
// switch is instant. Skipped when the browser asks to save data; neighbours are still prefetched.
if (!navigator.connection?.saveData) {
  const all = () => prefetchSheets(Array.from({ length: sheetCount() }, (_, i) => i));
  sheetsReady(sheetsFor(pageOf(visible(), page))).then(() =>
    "requestIdleCallback" in window ? requestIdleCallback(all, { timeout: 2000 }) : setTimeout(all, 500));
}
