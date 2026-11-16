import { loadFish, CATEGORIES, OCEAN_FISHING } from "./data.js";
import { fishIcon, fishPlaceholder, loadIcons, prefetchSheets, sheetsFor, sheetsReady, sheetCount } from "./icons.js";
import { loadCaught, saveCaught, loadTab, saveTab } from "./storage.js";
import { XIVAPI, XIVAPI_SCHEMA } from "./fishsource.js";
import { createTimers } from "./timers.js";
import { baitChains, loadTeamcraft, xivAsset, xivRows } from "./teamcraft.js";

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
const BY_ID = new Map([...FISH_LIST, ...SPEAR_LIST].map(f => [f.id, f]));
const caught = loadCaught(new Set(BY_ID.keys()));
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
// Always the same number of slots between the arrows (7 once there are more than 7 pages), and gaps are as
// wide as buttons, so the arrows and the search box don't move when you change page.
const SLOTS = 7;
function pageSlots(count) {
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  if (count <= SLOTS) return range(0, count - 1);
  const last = count - 1;
  if (page <= 3) return [...range(0, 4), null, last];                // 1 2 3 4 5 … N
  if (page >= last - 3) return [0, null, ...range(last - 4, last)];  // 1 … N-4 N-3 N-2 N-1 N
  return [0, null, page - 1, page, page + 1, null, last];           // 1 … p-1 p p+1 … N
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
// Best bait: from Teamcraft's fishing data — the bait, then any fish to mooch with ("or" between baits that all work).
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
      return { groups, items, spots };
    }).catch(e => { baitInfo.delete(id); throw e; }));
  }
  return baitInfo.get(id);
}
function baitHtml({ groups, items, spots }) {
  const item = id => {
    const it = items[id] ?? { name: BY_ID.get(id)?.name ?? `Item ${id}` };
    const img = it.icon ? `<img src="${esc(it.icon)}" alt="" loading="lazy" onerror="this.remove()">` : "";
    return `<span class="fv-bait-item">${img}${esc(it.name)}</span>`;
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
function openFishView(f) {
  viewing = f.id;
  $("#fvName").textContent = f.name;
  $("#fvIcon").innerHTML = fishIcon(f);
  $("#fvTags").innerHTML = [
    caught.has(f.id) ? `<span class="caught">✓ Caught</span>` : "",
    f.big ? `<span class="big">◆ Big fish</span>` : "",
    f.collectable ? `<span>Collectable</span>` : "",
    f.spear ? `<span>Spearfishing</span>` : "",
  ].join("");
  const facts = [
    ["Location", f.zone + (f.zone !== f.region ? ", " + f.region : "")],
    [f.spear ? "Size" : "Water", f.water],
    f.cat !== OCEAN_FISHING ? ["Level", String(f.lvl)] : null,
    [f.cat === OCEAN_FISHING ? "Category" : "Expansion", CATEGORIES[f.cat]],
    f.spear ? null : ["Best bait", "…"], // filled in from Teamcraft's data below
    ["Aquarium", aquariumText(f.aquarium)],
    ["Canvas", "…"], // filled in from the description below
    ["Status", caught.has(f.id) ? "Caught" : "Not yet caught"],
    ["Item ID", String(f.id)],
  ].filter(Boolean);
  $("#fvFacts").innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd${k === "Canvas" ? ` id="fvCanvas" class="pending"` : k === "Best bait" ? ` id="fvBait" class="pending fv-bait"` : ""}>${esc(v)}</dd>`).join("");
  const desc = $("#fvDesc");
  desc.innerHTML = `<span class="loading">Loading description…</span>`;
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
  }, () => {
    if (viewing === f.id) $("#fvBait").textContent = "Unavailable right now";
  });
  hideTip();
  if (!fishDialog.open) fishDialog.showModal();
  fishDialog.focus(); // the dialog itself, so the × doesn't show a focus ring on open
}
fishDialog.addEventListener("close", () => { viewing = null; });
$("#fvClose").addEventListener("click", () => fishDialog.close());
fishDialog.addEventListener("click", e => { if (e.target === fishDialog) fishDialog.close(); }); // click on backdrop

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
}
editBtn.addEventListener("click", () => setEditing(!editing));
setEditing(false);

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

/* ---------- Import ---------- */
// Accepts game item ids separated by commas (also spaces, semicolons or new lines).
function parseIds(text) {
  const ids = [], invalid = [];
  for (const tok of text.split(/[\s,;]+/)) {
    if (!tok) continue;
    if (/^\d+$/.test(tok)) ids.push(+tok); else invalid.push(tok);
  }
  return { ids: [...new Set(ids)], invalid };
}

const dlg = $("#importDialog"), importText = $("#importText"), importResult = $("#importResult"), importGo = $("#importGo");
let confirmReplace = false; // "replace" needs a second click when it would unmark fish

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
  resetImportState();
  showResult("");
  if (!dlg.open) dlg.showModal();
  importText.focus();
}
$("#importBtn").addEventListener("click", openImportDialog);
$("#importCancel").addEventListener("click", () => dlg.close());
dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); }); // click on backdrop
importText.addEventListener("input", resetImportState);
dlg.querySelectorAll("input[name=importMode]").forEach(r => r.addEventListener("change", resetImportState));
$("#importFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  importText.value = await file.text();
  e.target.value = "";
  resetImportState();
  showResult(`Loaded <b>${esc(file.name)}</b>. Click Import to apply.`);
});

$("#importForm").addEventListener("submit", e => {
  e.preventDefault();
  const { ids, invalid } = parseIds(importText.value);
  const known = ids.filter(id => BY_ID.has(id)), unknown = ids.filter(id => !BY_ID.has(id));
  const replace = dlg.querySelector("input[name=importMode]:checked").value === "replace";

  if (!known.length) {
    showResult(ids.length || invalid.length
      ? `None of these are fish item IDs, so nothing was changed.${unknown.length ? `<div class="sub">Not fish: ${listSample(unknown)}</div>` : ""}${invalid.length ? `<div class="sub">Not numbers: ${listSample(invalid)}</div>` : ""}`
      : "Paste some item IDs first.", "warn");
    return;
  }

  const knownSet = new Set(known);
  const removed = replace ? [...caught].filter(id => !knownSet.has(id)) : [];
  if (replace && removed.length && !confirmReplace) {
    confirmReplace = true;
    importGo.textContent = `Unmark ${removed.length} & import`;
    importGo.classList.add("danger");
    showResult(`This will <b>unmark ${removed.length}</b> fish that aren't in your list. Click the button again to confirm.`, "warn");
    return;
  }

  const added = known.filter(id => !caught.has(id)).length;
  if (replace) caught.clear();
  known.forEach(id => caught.add(id));
  saveCaught(caught);
  render();
  resetImportState();

  const parts = [`Marked <b>${added}</b> new fish as caught` + (known.length - added ? ` (${known.length - added} already caught)` : "") + "."];
  if (removed.length) parts.push(`Unmarked <b>${removed.length}</b> fish not in the list.`);
  parts.push(SPEAR_LIST.length
    ? `You now have <b>${countCaught(FISH_LIST)}</b> / ${FISH_LIST.length} fish and <b>${countCaught(SPEAR_LIST)}</b> / ${SPEAR_LIST.length} spearfish caught.`
    : `You now have <b>${countCaught(FISH_LIST)}</b> / ${FISH_LIST.length} caught.`);
  if (unknown.length) parts.push(`<div class="sub">Skipped ${unknown.length} ID${unknown.length > 1 ? "s that aren't fish" : " that isn't a fish"}: ${listSample(unknown)}</div>`);
  if (invalid.length) parts.push(`<div class="sub">Skipped ${invalid.length} entr${invalid.length > 1 ? "ies that aren't numbers" : "y that isn't a number"}: ${listSample(invalid)}</div>`);
  // Success: close the dialog and show the summary as a short-lived notice instead.
  dlg.close();
  importText.value = "";
  showToast(parts.join(" "), unknown.length || invalid.length ? 9000 : 5000);
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
// Links from the Of Dragons Deep Dalamud plugin: ?import=1.<data>, where <data> is the sorted item ids
// stored as deltas (LEB128 varints), raw-DEFLATE compressed, base64url without padding.
// A plain id list (?import=4776,4869) works too.
async function decodeImportParam(value) {
  if (/^[\d\s,;]+$/.test(value)) return value;
  const m = /^1\.([A-Za-z0-9_-]*)$/.exec(value);
  if (!m) throw new Error("Unrecognised import link");
  const bytes = Uint8Array.from(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  const ids = [];
  let prev = 0, cur = 0, shift = 0;
  for (const b of raw) {
    cur += (b & 0x7f) * 2 ** shift;
    if (b & 0x80) { shift += 7; continue; }
    prev += cur; ids.push(prev);
    cur = 0; shift = 0;
  }
  return ids.join(", ");
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
    dlg.querySelector("input[name=importMode][value=add]").checked = true;
    const n = parseIds(importText.value).ids.filter(id => BY_ID.has(id)).length;
    // Nothing is changed until the Import button is pressed.
    showResult(`Loaded <b>${n}</b> fish from your link. Choose Add or Replace, then click <b>Import</b>.`);
  } catch {
    showResult("This import link couldn't be read. It may have been cut off when it was copied.", "warn");
  }
}

/* ---------- Pages: Fish Guide / Fish Timers (navigation bar, #timers in the URL) ---------- */
let timers = null; // created the first time the Timers page is opened
function route() {
  const view = location.hash === "#timers" ? "timers" : "guide";
  document.body.dataset.view = view;
  $("#guideView").hidden = view !== "guide";
  $("#timersView").hidden = view !== "timers";
  $("#tabs").hidden = view !== "guide" || !SPEAR_LIST.length;
  $(".progress").hidden = view !== "guide";
  document.querySelectorAll("#topnav a").forEach(a => a.toggleAttribute("aria-current", a.dataset.view === view));
  hideTip(); closePanel();
  if (view === "timers") {
    timers ??= createTimers($("#timersView"), { byId: BY_ID, isCaught: id => caught.has(id), fishIcon, onOpen: openFishView, esc });
    timers.show();
  } else {
    timers?.hide();
    render();
  }
}
window.addEventListener("hashchange", route);

/* ---------- Start ---------- */
setMode(mode);
render();
route();

// Then, once the first page is showing, quietly load the remaining sheets (≈1.7 MB in all) so every page
// switch is instant. Skipped when the browser asks to save data; neighbours are still prefetched.
if (!navigator.connection?.saveData) {
  const all = () => prefetchSheets(Array.from({ length: sheetCount() }, (_, i) => i));
  sheetsReady(sheetsFor(pageOf(visible(), page))).then(() =>
    "requestIdleCallback" in window ? requestIdleCallback(all, { timeout: 2000 }) : setTimeout(all, 500));
}
