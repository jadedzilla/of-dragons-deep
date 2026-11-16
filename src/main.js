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
function pageButtons(count) {
  const set = new Set([0, count - 1]);
  for (let i = page - 2; i <= page + 2; i++) if (i >= 0 && i < count) set.add(i);
  const list = [...set].sort((a, b) => a - b);
  const out = [{ label: "‹", to: page - 1, dis: page === 0, arrow: true }];
  list.forEach((p, i) => {
    if (i && p - list[i - 1] > 1) out.push({ gap: true });
    out.push({ label: p + 1, to: p, active: p === page });
  });
  out.push({ label: "›", to: page + 1, dis: page >= count - 1, arrow: true });
  return out;
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
    <div class="m">Fish Guide #${f.no} · page ${Math.ceil(f.no / PER_PAGE)}</div>
    <div class="m">${caught.has(f.id) ? "✔ Caught" : "Not yet caught"}</div>`;
  const r = t.getBoundingClientRect();
  tip.style.display = "block";
  const w = tip.offsetWidth;
  tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)) + "px";
  tip.style.top = (r.top - tip.offsetHeight - 6 < 0 ? r.bottom + 6 : r.top - tip.offsetHeight - 6) + "px";
}

/* ---------- Events ---------- */
grid.addEventListener("click", e => {
  const t = e.target.closest(".tile[data-id]");
  if (!t) return;
  const id = +t.dataset.id;
  caught.has(id) ? caught.delete(id) : caught.add(id);
  saveCaught(caught);
  render();
  const nt = grid.querySelector(`.tile[data-id="${id}"]`);
  if (nt) showTip(nt); else tip.style.display = "none";
});
// Icons not in the bundled sheets load from XIVAPI; if that fails, swap in the placeholder.
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
$("#resetFilters").addEventListener("click", () => {
  Object.assign(filters, { status: "all", bigOnly: false, collOnly: false, cats: allCats() });
  panel.querySelectorAll("input").forEach(i => { i.checked = i.type === "radio" ? i.value === "all" : !!i.dataset.cat; });
  page = 0;
  render();
});

render();
