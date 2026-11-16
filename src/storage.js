// Per-browser persistence in localStorage: caught fish (game item ids), the last tab shown and achievements
// marked obtained by hand.
// Every access is guarded, so the app still works where storage is unavailable.

const CAUGHT_KEY = "odd-caught-v2";
const TAB_KEY = "odd-tab";
const MARKS_KEY = "odd-achievements-v1";

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
