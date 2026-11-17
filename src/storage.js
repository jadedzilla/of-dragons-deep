// Per-browser persistence in localStorage: caught fish (game item ids), the last tab shown and achievements
// marked obtained by hand.
// Every access is guarded, so the app still works where storage is unavailable.

const CAUGHT_KEY = "odd-caught-v2";
const TAB_KEY = "odd-tab";
const MARKS_KEY = "odd-achievements-v1";
const SEEN_KEY = "odd-achievements-seen-v1";
const PROGRESS_KEY = "odd-achievements-progress-v1";

export function loadCaught(validIds) {
  try {
    return new Set(JSON.parse(localStorage.getItem(CAUGHT_KEY) || "[]").filter(id => validIds.has(id)));
  } catch {
    return new Set();
  }
}

export function saveCaught(caught) {
  try { localStorage.setItem(CAUGHT_KEY, JSON.stringify([...caught])); } catch { /* storage unavailable */ }
}

/** The saved tab ("fish" or "spear"), or null. */
export function loadTab() {
  try { return localStorage.getItem(TAB_KEY); } catch { return null; }
}

export function saveTab(tab) {
  try { localStorage.setItem(TAB_KEY, tab); } catch { /* storage unavailable */ }
}

/** Achievement ids marked obtained by hand (for achievements the app can't work out from caught fish). */
export function loadMarks() {
  try { return new Set(JSON.parse(localStorage.getItem(MARKS_KEY) || "[]").filter(Number.isInteger)); } catch { return new Set(); }
}

export function saveMarks(marks) {
  try { localStorage.setItem(MARKS_KEY, JSON.stringify([...marks])); } catch { /* storage unavailable */ }
}

/** Achievement progress imported from the plugin: { at: ISO date or null, items: { id: [current, max] } }. */
export function loadAchievementProgress() {
  try {
    const v = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null");
    return v && typeof v.items === "object" ? v : { at: null, items: {} };
  } catch { return { at: null, items: {} }; }
}

export function saveAchievementProgress(progress) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* storage unavailable */ }
}

/**
 * When each achievement was first seen obtained (ms since epoch), so the Share card can show recent ones. The game
 * data has no dates: this is when the app first noticed (ticked, worked out from fish, or imported). Ones already
 * obtained the first time this runs get 0. Achievements no longer obtained are dropped.
 */
export function noteObtained(doneIds) {
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "null"); } catch { /* storage unavailable */ }
  const first = !seen;
  seen ??= {};
  const now = Date.now(), done = new Set(doneIds);
  let changed = first;
  for (const id of done) if (!(id in seen)) { seen[id] = first ? 0 : now; changed = true; }
  for (const id of Object.keys(seen)) if (!done.has(+id)) { delete seen[id]; changed = true; }
  if (changed) try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* storage unavailable */ }
  return seen;
}
