// Fish icons from the committed sprite sheets (src/assets/icons, 10×10 icons of 80px each, built by
// scripts/fetch-icons.mjs). Vite gives each sheet a hashed file name, so a changed sheet is never served from cache.
// Sheets load on demand; a sheet that arrives within 100 ms shows at once, slower ones fade in.
import manifest from "../data/icons.json";

const urls = import.meta.glob("../assets/icons/*.webp", { eager: true, query: "?url", import: "default" });
const SHEET_URLS = manifest.sheets.map(s => urls[`../assets/icons/${s}`]);
const COLS = manifest.cols, PER_SHEET = COLS * COLS, FADE_AFTER_MS = 100;

export const sheetCount = SHEET_URLS.length;

/** Where a fish's icon is: { sheet, url, size, position } (CSS background values), or null if it isn't in the sheets. */
export function iconSpot(f) {
  const i = manifest.icons[f.icon];
  if (i === undefined) return null;
  const k = i % PER_SHEET, step = 100 / (COLS - 1), sheet = Math.floor(i / PER_SHEET);
  return { sheet, url: SHEET_URLS[sheet], size: `${COLS * 100}% ${COLS * 100}%`,
    position: `${(k % COLS) * step}% ${Math.floor(k / COLS) * step}%` };
}

/** Sheet numbers these fish need. */
export const sheetsFor = fish => [...new Set(fish.map(iconSpot).filter(Boolean).map(s => s.sheet))];

// Loading state per sheet: undefined (not requested), "loading", "ready" (faded in) or "instant".
const state = [], loaded = [], listeners = new Set();
export const sheetState = i => state[i];
export function subscribeSheets(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function requestSheet(i) {
  if (loaded[i]) return loaded[i];
  state[i] = "loading";
  const t0 = performance.now();
  return loaded[i] = new Promise(resolve => {
    const img = new Image();
    img.onload = img.onerror = () => { // on error too, so a failed sheet never leaves tiles invisible
      state[i] = performance.now() - t0 > FADE_AFTER_MS ? "ready" : "instant";
      listeners.forEach(fn => fn());
      resolve();
    };
    img.src = SHEET_URLS[i];
  });
}
export const sheetsReady = indices => Promise.all(indices.map(requestSheet));

// Background loading, one sheet at a time; urgent ones (neighbouring pages) jump the queue.
let queue = [], pumping = false;
export function prefetchSheets(indices, { urgent = false } = {}) {
  const fresh = [...new Set(indices)].filter(i => i >= 0 && i < sheetCount && !loaded[i]);
  queue = urgent ? [...fresh, ...queue.filter(i => !fresh.includes(i))] : [...queue, ...fresh.filter(i => !queue.includes(i))];
  pump();
}
async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length) { const i = queue.shift(); if (!loaded[i]) await requestSheet(i); }
  pumping = false;
}
