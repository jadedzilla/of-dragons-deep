import { dataChunk, expect, gridReady, openApp, test } from "./fixtures.js";

test("the nav bar switches pages by address, so Back works", async ({ page }) => {
  await openApp(page);
  await gridReady(page);
  for (const [view, sel] of [["timers", ".tm-row"], ["achievements", ".ac-section"], ["route", ".lr-step"], ["share", "#shImg"]]) {
    await page.locator(`#topnav a[data-view="${view}"]`).click();
    await expect(page.locator(`#${view}View`)).toBeVisible();
    await expect(page.locator(sel).first()).toBeVisible();
    await expect(page.locator(`#topnav a[data-view="${view}"]`)).toHaveAttribute("aria-current", "page");
    await expect(page.locator("#guideView")).toBeHidden();
    await expect(page.locator("#tabs")).toBeHidden();
  }
  await page.goBack();
  await expect(page.locator("#routeView")).toBeVisible();
});

test("a page opened directly shows a placeholder until the fish list arrives", async ({ page }) => {
  let release;
  const held = new Promise(r => { release = r; });
  await page.route(dataChunk("fish"), async route => { await held; await route.fallback(); });
  await openApp(page, { path: "#timers" });
  await expect(page.locator("#timersView .sk").first()).toBeVisible();
  await expect(page.locator("#guideView")).toBeHidden();
  release();
  await expect(page.locator(".tm-row").first()).toBeVisible();
});

test("the Fish Guide shows shimmering tiles while it loads", async ({ page }) => {
  let release;
  const held = new Promise(r => { release = r; });
  await page.route(dataChunk("fish"), async route => { await held; await route.fallback(); });
  await openApp(page);
  await expect(page.locator(".tile.sk")).toHaveCount(100);
  release();
  await gridReady(page);
});

test("bait chips on the Log Route open the bait view", async ({ page }) => {
  await openApp(page, { path: "#route" });
  await page.locator(".lr-step .bait-link").first().click();
  await expect(page.locator("#baitDialog .bv-list li").first()).toBeVisible();
});
