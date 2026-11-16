import { loadFish, CATEGORIES, OCEAN_FISHING } from "./data.js";
import { fishIcon, fishPlaceholder, loadIcons } from "./icons.js";
import { loadCaught, saveCaught } from "./storage.js";

const PER_PAGE = 100; // 10x10 grid

const $ = s => document.querySelector(s);
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const grid = $("#grid"), pagesEl = $("#pages"), tip = $("#tooltip");

const [{ fish: FISH, live, fetched, error }] = await Promise.all([loadFish(), loadIcons()]);
const BY_ID = new Map(FISH.map(f => [f.id, f]));
const caught = loadCaught(new Set(BY_ID.keys()));

const allCats = () => new Set(CATEGORIES.map((_, i) => i));
const filters = { status: "all", cats: allCats(), bigOnly: false, collOnly: false };
let page = 0, query = "";

$("#expFilters").innerHTML = CATEGORIES.map((c, i) =>
  `<label><input type="checkbox" data-cat="${i}" checked> ${c} <span class="n">${FISH.filter(f => f.cat === i).length}</span></label>`).join("");
$("#dataNote").textContent = live
  ? `${FISH.length} fish · live from ff14fish.carbuncleplushy.com${fetched ? ` (updated ${fetched})` : ""} · icons via XIVAPI`
  : `${FISH.length} fish · offline snapshot from ${fetched} (couldn't reach ff14fish.carbuncleplushy.com: ${error}) · icons via XIVAPI`;
$("#dataNote").classList.toggle("offline", !live);

// Filtering keeps source order (the tracker's Fish Guide order); don't sort.
function visible() {
  const q = query.trim().toLowerCase();
  return FISH.filter(f =>
    (!q || f.name.toLowerCase().includes(q) || f.zone.toLowerCase().includes(q)) &&
    filters.cats.has(f.cat) &&
    (!filters.bigOnly || f.big) &&
    (!filters.collOnly || f.collectable) &&
    (filters.status === "all" || (filters.status === "caught") === caught.has(f.id))
  );
}

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

function render() {
  const list = visible();
  const pageCount = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (page >= pageCount) page = pageCount - 1;

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

  const slice = list.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  if (!list.length) {
    grid.innerHTML = `<div class="empty-msg">No fish match your search.</div>`;
  } else {
    let html = "";
    for (const f of slice) html += `<div class="tile${caught.has(f.id) ? " caught" : ""}${f.big ? " big" : ""}" data-id="${f.id}">${fishIcon(f)}</div>`;
    for (let i = slice.length; i < PER_PAGE; i++) html += `<div class="tile empty"></div>`;
    grid.innerHTML = html;
  }

  $("#caughtCount").textContent = caught.size;
  $("#totalCount").textContent = FISH.length;
  $("#showing").textContent = list.length === FISH.length ? "" : `${list.length} match`;
  const active = (filters.status !== "all") + (filters.cats.size !== CATEGORIES.length) + filters.bigOnly + filters.collOnly;
  const fc = $("#filterCount");
  fc.textContent = active;
  fc.classList.toggle("on", active > 0);
}

function showTip(t) {
  const f = BY_ID.get(+t.dataset.id);
  const tags = [f.big ? "Big fish" : "", f.collectable ? "Collectable" : ""].filter(Boolean).join(" · ");
  tip.innerHTML = `<div class="n">${esc(f.name)}</div>
    <div class="m">${esc(f.zone)}${f.zone !== f.region ? ", " + esc(f.region) : ""}</div>
    <div class="m">${esc(f.water)}${f.cat !== OCEAN_FISHING ? " · Lv. " + f.lvl : ""} · ${CATEGORIES[f.cat]}</div>
    ${tags ? `<div class="t">${tags}</div>` : ""}
    <div class="m">${caught.has(f.id) ? "✔ Caught" : "Not yet caught"}</div>`;
  const r = t.getBoundingClientRect();
  tip.style.display = "block";
  const w = tip.offsetWidth;
  tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)) + "px";
  tip.style.top = (r.top - tip.offsetHeight - 6 < 0 ? r.bottom + 6 : r.top - tip.offsetHeight - 6) + "px";
}

/* ---------- Events ---------- */
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
  if (!editing) { showTip(t); return; } // view only: show details (also handy on touch screens)
  const id = +t.dataset.id;
  caught.has(id) ? caught.delete(id) : caught.add(id);
  saveCaught(caught);
  render();
  const nt = grid.querySelector(`.tile[data-id="${id}"]`);
  if (nt) showTip(nt); else tip.style.display = "none";
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
grid.addEventListener("mouseleave", () => { tip.style.display = "none"; });
window.addEventListener("scroll", () => { tip.style.display = "none"; }, { passive: true });

$("#search").addEventListener("input", e => { query = e.target.value; page = 0; render(); });

const panel = $("#filterPanel"), fbtn = $("#filterBtn");
fbtn.addEventListener("click", e => { e.stopPropagation(); panel.classList.toggle("open"); fbtn.classList.toggle("open"); });
document.addEventListener("click", e => {
  if (!panel.contains(e.target) && !fbtn.contains(e.target)) { panel.classList.remove("open"); fbtn.classList.remove("open"); }
});
panel.addEventListener("change", e => {
  const el = e.target;
  if (el.name === "status") filters.status = el.value;
  else if (el.id === "bigOnly") filters.bigOnly = el.checked;
  else if (el.id === "collOnly") filters.collOnly = el.checked;
  else if (el.dataset.cat) { const c = +el.dataset.cat; el.checked ? filters.cats.add(c) : filters.cats.delete(c); }
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
  panel.classList.remove("open"); fbtn.classList.remove("open");
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
  parts.push(`You now have <b>${caught.size}</b> / ${FISH.length} caught.`);
  if (unknown.length) parts.push(`<div class="sub">Skipped ${unknown.length} ID${unknown.length > 1 ? "s that aren't fish" : " that isn't a fish"}: ${listSample(unknown)}</div>`);
  if (invalid.length) parts.push(`<div class="sub">Skipped ${invalid.length} entr${invalid.length > 1 ? "ies that aren't numbers" : "y that isn't a number"}: ${listSample(invalid)}</div>`);
  // Success: close the dialog and show the summary as a short-lived notice instead.
  dlg.close();
  importText.value = "";
  showToast(parts.join(" "), unknown.length || invalid.length ? 9000 : 5000);
});

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

$("#resetFilters").addEventListener("click", () => {
  Object.assign(filters, { status: "all", bigOnly: false, collOnly: false, cats: allCats() });
  panel.querySelectorAll("input").forEach(i => { i.checked = i.type === "radio" ? i.value === "all" : !!i.dataset.cat; });
  page = 0;
  render();
});

render();
