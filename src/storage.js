// Per-browser persistence in localStorage: caught fish (game item ids) and the last tab shown.
// Every access is guarded, so the app still works where storage is unavailable.

const CAUGHT_KEY = "odd-caught-v2";
const TAB_KEY = "odd-tab";

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
