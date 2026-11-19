import { CAUGHT, expect, gridReady, openApp, test } from "./fixtures.js";

test("shows the Fish Guide in log order, 100 to a page", async ({ page }) => {
  const errors = await openApp(page, { storage: { "odd-caught-v2": CAUGHT } });
  await gridReady(page);
  await expect(page.locator(".tile[data-id]")).toHaveCount(100);
  await expect(page.locator(".tile[data-id]").first()).toHaveAttribute("data-id", "4776"); // Malm Kelp, first in the game's log
  await expect(page.locator("#totalCount")).toHaveText(/^1,?5\d\d$/);
  await expect(page.locator("#caughtCount")).toHaveText("6"); // spearfish 20144 counts on the other tab
  await expect(page.locator("#dataNote")).toContainText(/game data from XIVAPI \(patch \d/);
  await expect(page.locator(".pg.active")).toHaveText("1");
  await page.locator(".pg", { hasText: "2" }).click();
  await expect(page.locator(".pg.active")).toHaveText("2");
  await expect(page.locator(".pages > *")).toHaveCount(9); // ‹ + 7 slots + › on desktop, whatever the page
  expect(errors).toEqual([]);
});

test("searches and filters, keeping the order", async ({ page }) => {
  await openApp(page, { storage: { "odd-caught-v2": CAUGHT } });
  await gridReady(page);
  await page.locator("#search").fill("goby");
  await expect(page.locator("#showing")).toHaveText(/\d+ match/);
  await expect(page.locator(".tile[data-id]").first()).toBeVisible();
  await page.locator("#search").fill("zzzz");
  await expect(page.locator(".empty-msg")).toHaveText("No fish match your search.");
  await page.locator("#search").fill("");
  await page.locator("#filterBtn").click();
  await page.getByLabel("Caught", { exact: true }).check();
  await expect(page.locator(".tile[data-id]")).toHaveCount(6);
  await expect(page.locator("#filterCount")).toHaveText("1");
  await page.locator("#resetFilters").click();
  await expect(page.locator(".tile[data-id]")).toHaveCount(100);
  await page.locator("h1").click(); // a click elsewhere closes the panel
  await expect(page.locator("#filterPanel")).not.toHaveClass(/open/);
});

test("switches to spearfishing and remembers the tab", async ({ page }) => {
  await openApp(page);
  await gridReady(page);
  await page.locator('[data-mode="spear"]').click();
  await expect(page.locator("#dataNote")).toContainText("spearfish");
  await expect(page.locator("#bigLegend")).toHaveClass("off");
  await page.reload();
  await expect(page.locator('[data-mode="spear"]')).toHaveClass(/active/);
});

test("phones get one toolbar row and 5 page slots", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await openApp(page);
  await gridReady(page);
  await expect(page.locator(".pages > *")).toHaveCount(7);
  const mids = await page.locator(".toolbar > :is(.pages, .search, .filter-btn)").evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }));
  expect(new Set(mids).size).toBe(1);
  await page.close();
});

test("switches light and dark mode and remembers it", async ({ page }) => {
  await openApp(page, { storage: { "odd-theme": "light" } });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator("#themeBtn").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("can be installed as a home-screen app", async ({ page }) => {
  await openApp(page);
  await gridReady(page);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);
});
