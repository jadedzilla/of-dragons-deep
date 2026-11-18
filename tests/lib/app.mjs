// Small helpers for driving the app in tests. Prefer waiting for a condition over fixed sleeps.

/** Wait until the Fish Guide grid has rendered (fish data loaded). */
export const gridReady = page => page.waitForSelector(".tile[data-id]", { timeout: 20000 });

/** Open a page from the navigation bar and wait for it to be shown. */
export async function goTo(page, view) {
  await page.click(`#topnav a[data-view=${view}]`);
  await page.waitForSelector(`#${view === "guide" ? "guideView" : view + "View"}:not([hidden])`);
}

/** Type into the search box (it may be collapsed to an icon) and wait for the grid to re-render. */
export async function search(page, text) {
  await page.evaluate(t => { const s = document.querySelector("#search"); s.value = t; s.dispatchEvent(new Event("input")); }, text);
}

/** A fixed moment (ET 05:42) for the suites that depend on Eorzea time. */
export const T0 = 1794850000;

/** The plugin's Copy JSON export (version 2): caught fish ids, plus achievements when given. */
export const pluginExport = (fish, achievements) =>
  JSON.stringify({ source: "OfDragonsDeep", version: 2, fish, ...(achievements ? { achievements } : {}) });

/** The plugin's Copy tracker link payload (?import=2.<data>): base64url of raw-DEFLATE'd LEB128 varints: fish count +
 *  sorted id deltas; then achievement count + per achievement (by id) the id delta and 0 / 1 complete / 2 + current + max. */
export async function pluginLink(fish, achievements) {
  const { deflateRawSync } = await import("node:zlib");
  const out = [], v = n => { do { let b = n & 0x7f; n = Math.floor(n / 128); if (n) b |= 0x80; out.push(b); } while (n); };
  const deltas = ids => { let prev = 0; return ids.map(id => { const d = id - prev; prev = id; return d; }); };
  const f = [...fish].sort((a, b) => a - b);
  v(f.length); deltas(f).forEach(v);
  if (achievements) {
    const a = [...achievements].sort((x, y) => x.id - y.id), d = deltas(a.map(x => x.id));
    v(a.length);
    a.forEach((x, i) => { v(d[i]); if (x.complete) v(1); else if (x.max) { v(2); v(x.current); v(x.max); } else v(0); });
  }
  return "2." + deflateRawSync(Buffer.from(out)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Import fish (and optionally achievements) through the Import dialog, in "add" mode, and wait for it to close. */
export async function importFish(page, ids, achievements) {
  await page.click("#importBtn");
  await page.check("input[name=importMode][value=add]");
  await page.fill("#importText", pluginExport(ids, achievements));
  await page.click("#importGo");
  await page.waitForFunction(() => !document.querySelector("#importDialog").open);
  await closeGacha(page);
}

/** Close the new-fish reveal that follows an import that caught new fish (no-op if it isn't showing). */
export const closeGacha = page => page.evaluate(() => document.querySelector("#gachaDialog")?.close());

export const caughtCount = page => page.textContent("#caughtCount").then(Number);
export const tileIds = page => page.$$eval(".tile[data-id]", ts => ts.map(t => +t.dataset.id));
export const text = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, " ").trim());
export const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
