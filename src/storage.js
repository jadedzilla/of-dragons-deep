// Caught-fish persistence in localStorage (per browser). Keyed by game fish id.

const KEY = "odd-caught-v2";

export function loadCaught(validIds) {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || "[]").filter(id => validIds.has(id)));
  } catch {
    return new Set();
  }
}

export function saveCaught(caught) {
  try { localStorage.setItem(KEY, JSON.stringify([...caught])); } catch { /* storage unavailable */ }
}
