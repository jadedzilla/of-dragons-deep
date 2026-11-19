// Per-browser data in localStorage. Every access is guarded, so the app still works where storage is unavailable.
export const KEYS = {
  caught: "odd-caught-v2",                  // caught fish (game item ids)
  tab: "odd-tab",                           // "fish" or "spear"
  theme: "odd-theme",
  marks: "odd-achievements-v1",             // achievements marked obtained (by hand or imported)
  progress: "odd-achievements-progress-v1", // { at, items: { id: [current, max] } } from the plugin
  seen: "odd-achievements-seen-v1",         // { id: ms } when each achievement was first seen obtained
  openSections: "odd-achievements-open",
  closedGroups: "odd-achievements-groups-closed",
  routeTimed: "odd-route-timed",            // "1" to include timed fish (off by default)
  routeBig: "odd-route-big",                // "0" to leave big fish out (included by default)
  shareName: "odd-share-name",
};

export function readRaw(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function writeRaw(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}
export function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; }
}
export const writeJson = (key, value) => writeRaw(key, JSON.stringify(value));

export const loadCaught = validIds => new Set(readJson(KEYS.caught, []).filter(id => validIds.has(id)));
export const saveCaught = caught => writeJson(KEYS.caught, [...caught]);

export const loadMarks = () => new Set(readJson(KEYS.marks, []).filter(Number.isInteger));
export const saveMarks = marks => writeJson(KEYS.marks, [...marks]);

export function loadProgress() {
  const v = readJson(KEYS.progress, null);
  return v && typeof v.items === "object" ? v : { at: null, items: {} };
}
export const saveProgress = progress => writeJson(KEYS.progress, progress);

/**
 * Records when each achievement was first seen obtained (the game data has no dates). The first time, everything
 * already obtained gets 0; achievements no longer obtained are dropped. Returns { id: ms }.
 */
export function noteObtained(doneIds) {
  const stored = readJson(KEYS.seen, null), first = !stored, seen = stored ?? {};
  const now = Date.now(), done = new Set(doneIds);
  let changed = first;
  for (const id of done) if (!(id in seen)) { seen[id] = first ? 0 : now; changed = true; }
  for (const id of Object.keys(seen)) if (!done.has(+id)) { delete seen[id]; changed = true; }
  if (changed) writeJson(KEYS.seen, seen);
  return seen;
}
