// Bait view: clicking a bait (icon or name) anywhere in the app opens a dialog showing where to get it: the vendors
// that sell it (NPC, zone, map coordinates, price) and who can craft it, from data/baits.json (built by
// scripts/fetch-bait-data.mjs from Teamcraft + XIVAPI; inlined in the single-file build). Bait chips are any element
// with data-bait="<item id>"; a fish used as bait (mooching) isn't one; it opens the fish view instead.

import { skeleton, skInline } from "./skeleton.js";
import { xivAsset } from "./teamcraft.js";

let baitDataPromise = null;
function loadBaitData() {
  baitDataPromise ??= (window.__BAIT_DATA__ ? Promise.resolve(window.__BAIT_DATA__)
    : fetch("data/baits.json").then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }))
    .catch(e => { baitDataPromise = null; throw e; });
  return baitDataPromise;
}

const VENDORS_SHOWN = 6;

/** Set up the bait dialog (#baitDialog) and the click handling for every [data-bait] chip. deps: { esc }. */
export function initBaitView({ esc }) {
  const dialog = document.querySelector("#baitDialog");
  const $b = s => dialog.querySelector(s);
  const price = (p, currencies) => p.map(([id, amount]) => {
    const [name, icon] = currencies[id] ?? [`Item ${id}`, ""];
    const img = icon ? `<img src="${esc(xivAsset(icon))}" alt="" loading="lazy" onerror="this.remove()">` : "";
    return `<span class="bv-price">${img}${amount.toLocaleString("en-US")}${id === 1 ? " gil" : ` ${esc(name)}`}</span>`;
  }).join(" + ");

  async function open(id) {
    $b("#bvName").innerHTML = skInline("140px");
    $b("#bvIcon").innerHTML = "";
    $b("#bvBody").innerHTML = skeleton("bait", "Loading where to get it…");
    if (!dialog.open) dialog.showModal();
    dialog.focus();
    let data;
    try { data = await loadBaitData(); }
    catch { $b("#bvBody").innerHTML = `<div class="loading">Couldn't load bait sources right now.</div>`; return; }
    const b = data.baits[id];
    if (!b) { $b("#bvName").textContent = `Item ${id}`; $b("#bvBody").innerHTML = `<div class="loading">No source information for this bait.</div>`; return; }
    $b("#bvName").textContent = b.name;
    $b("#bvIcon").innerHTML = b.icon ? `<img src="${esc(xivAsset(b.icon.replace(/\.tex$/, "_hr1.tex")))}" alt="" onerror="this.src='${esc(xivAsset(b.icon))}'">` : "";
    const row = ([npc, zone, x, y, p]) => `<li><span class="bv-npc">${esc(npc)}</span><span class="bv-where">${esc(zone)} <span class="bv-xy">(X ${x}, Y ${y})</span></span>${price(p, data.currencies)}</li>`;
    const parts = [];
    if (b.vendors.length) {
      const first = b.vendors.slice(0, VENDORS_SHOWN), rest = b.vendors.slice(VENDORS_SHOWN);
      parts.push(`<h3>Sold by</h3><ul class="bv-list">${first.map(row).join("")}</ul>`
        + (rest.length ? `<details class="bv-more"><summary>${rest.length} more vendor${rest.length > 1 ? "s" : ""}</summary><ul class="bv-list">${rest.map(row).join("")}</ul></details>` : ""));
    }
    if (b.crafted.length) parts.push(`<h3>Crafted by</h3><ul class="bv-list">${b.crafted.map(([job, lvl]) => `<li><span class="bv-npc">${esc(job)}</span><span class="bv-where">Level ${lvl} recipe</span></li>`).join("")}</ul>`);
    if (!parts.length) parts.push(`<div class="loading">Not sold by vendors or crafted. It comes from somewhere else in the game (quests, exchanges or drops).</div>`);
    if (b.vendors.length) parts.push(`<div class="bv-note">Vendors from FFXIV Teamcraft; seasonal-event vendors aren't listed.</div>`);
    $b("#bvBody").innerHTML = parts.join("");
  }

  $b("#bvClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  // any bait chip anywhere (fish view, Log Route…): capture so it works inside other dialogs and lists too
  document.addEventListener("click", e => {
    const chip = e.target.closest?.("[data-bait]");
    if (!chip) return;
    e.preventDefault();
    e.stopPropagation();
    open(+chip.dataset.bait);
  }, true);
  return { open };
}
