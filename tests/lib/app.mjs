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

/** Import fish ids through the Import dialog ("add" mode). */
export async function importFish(page, ids) {
  await page.click("#importBtn");
  await page.fill("#importText", ids.join(","));
  await page.click("#importGo");
  await page.waitForFunction(() => !document.querySelector("#importDialog").open);
}

export const caughtCount = page => page.textContent("#caughtCount").then(Number);
export const tileIds = page => page.$$eval(".tile[data-id]", ts => ts.map(t => +t.dataset.id));
export const text = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, " ").trim());
export const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
