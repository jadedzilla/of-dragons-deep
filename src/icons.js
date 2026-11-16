// Fish icons: real game icons from sprite sheets (data/icons/, built by scripts/fetch-icons.mjs from XIVAPI).
// Fish added since the sheets were built load their icon straight from XIVAPI; if that fails too
// (offline, or remote images blocked), main.js swaps in an SVG placeholder.
//
// Loading: icons start transparent and appear (CSS .ic.ready) once their sheet has loaded — at once (.instant) if
// it was already loaded or took under FADE_AFTER_MS, otherwise with a short fade. A sheet is requested the first
// time a tile needs it, or earlier by prefetchSheets; the browser reuses that download for the CSS background.

let ICONS = null;           // manifest: { cols, sheets, icons: { iconId: index } }
let SHEET_URLS = [];
const sheets = [];          // per sheet: { ready: boolean, loaded: Promise } once requested
const FADE_AFTER_MS = 100;  // sheets that arrive faster than this show at once; slower ones fade in

const perSheet = () => ICONS.cols * ICONS.cols;

/** Load the icon manifest and register one CSS class per sprite sheet. Resolves even if icons are unavailable. */
export async function loadIcons() {
  try {
    const m = window.__ICON_DATA__ ?? await fetch("data/icons.json").then(r => {
      if (!r.ok) throw new Error(`Could not load data/icons.json (${r.status})`);
      return r.json();
    });
    const base = window.__ICON_DATA__ ? "" : "data/icons/";
    SHEET_URLS = m.sheets.map(s => base + s);
    const style = document.createElement("style");
    style.textContent = m.sheets.map((s, i) => `.ic.s${i}{background-image:url("${base}${s}")}`).join("\n")
      + `\n.ic{background-size:${m.cols * 100}% ${m.cols * 100}%}`;
    document.head.appendChild(style);
    ICONS = m;
  } catch (e) {
    console.warn("Fish icons unavailable, using placeholders:", e.message);
  }
}

function requestSheet(i) {
  if (sheets[i]) return sheets[i].loaded;
  const sheet = sheets[i] = { ready: false };
  const t0 = performance.now();
  return sheet.loaded = new Promise(resolve => {
    const img = new Image();
    img.onload = img.onerror = () => { // on error too, so a failed sheet never leaves tiles invisible
      sheet.ready = true;
      const fade = performance.now() - t0 > FADE_AFTER_MS;
      document.querySelectorAll(`.ic.s${i}`).forEach(e => e.classList.add(...(fade ? ["ready"] : ["ready", "instant"])));
      resolve();
    };
    img.src = SHEET_URLS[i];
  });
}

/** Resolves once these sheets have loaded (requesting any that haven't started). */
export const sheetsReady = indices => Promise.all(indices.map(requestSheet));

/** Sheet numbers needed to show these fish. */
export function sheetsFor(fish) {
  if (!ICONS) return [];
  return [...new Set(fish.map(f => ICONS.icons[f.icon]).filter(i => i !== undefined).map(i => Math.floor(i / perSheet())))];
}
export const sheetCount = () => SHEET_URLS.length;

// Background loading: sheets are fetched one at a time so they never compete much with what's on screen.
// "Urgent" ones (the pages next to the current one) jump the queue.
let queue = [], pumping = false;
export function prefetchSheets(indices, { urgent = false } = {}) {
  if (!ICONS) return;
  const fresh = [...new Set(indices)].filter(i => i >= 0 && i < SHEET_URLS.length && !sheets[i]);
  queue = urgent ? [...fresh, ...queue.filter(i => !fresh.includes(i))] : [...queue, ...fresh.filter(i => !queue.includes(i))];
  pump();
}
async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length) { const i = queue.shift(); if (!sheets[i]) await requestSheet(i); }
  pumping = false;
}

/** Tile content for a fish: its sprite-sheet icon, else its icon straight from XIVAPI, else the placeholder. */
export function fishIcon(f) {
  const i = ICONS?.icons[f.icon];
  if (i === undefined) return f.icon ? `<img class="ic" alt="" loading="lazy" src="${remoteIconUrl(f.icon)}">` : fishPlaceholder(f);
  const per = perSheet(), k = i % per, step = 100 / (ICONS.cols - 1), sheet = Math.floor(i / per);
  requestSheet(sheet);
  return `<span class="ic s${sheet}${sheets[sheet].ready ? " ready instant" : ""}" style="background-position:${(k % ICONS.cols) * step}% ${Math.floor(k / ICONS.cols) * step}%"></span>`;
}

const remoteIconUrl = id => {
  const s = String(id).padStart(6, "0");
  return `https://v2.xivapi.com/api/asset?path=${encodeURIComponent(`ui/icon/${s.slice(0, 3)}000/${s}_hr1.tex`)}&format=png`;
};

function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** SVG fish silhouette, tinted from a hash of the name; used when no game icon is available. */
export function fishPlaceholder(f) {
  const hue = hash(f.name) % 360, hue2 = (hue + 40) % 360;
  const body = f.big
    ? "M8 32c10-14 30-18 44-6l8-8v28l-8-8c-14 12-34 8-44-6z"
    : "M10 32c8-11 24-14 36-5l8-7v24l-8-7c-12 9-28 6-36-5z";
  return `<svg viewBox="0 0 64 64"><defs><linearGradient id="g${f.id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="hsl(${hue},65%,68%)"/><stop offset="1" stop-color="hsl(${hue2},55%,36%)"/></linearGradient></defs>
    <path d="${body}" fill="url(#g${f.id})" stroke="#000" stroke-opacity=".55" stroke-width="1.5"/>
    <circle cx="${f.big ? 17 : 18}" cy="29" r="2.4" fill="#111"/><circle cx="${f.big ? 16.4 : 17.4}" cy="28.4" r=".8" fill="#fff"/></svg>`;
}
