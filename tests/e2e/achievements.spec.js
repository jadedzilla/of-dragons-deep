import { CAUGHT, expect, openApp, test } from "./fixtures.js";

test("lists Fisher achievements in collapsed sections, remembering which are open", async ({ page }) => {
  const errors = await openApp(page, { path: "#achievements", storage: { "odd-caught-v2": CAUGHT } });
  const log = page.locator('.ac-section[data-section="log"]');
  await expect(log).toBeVisible();
  await expect(page.locator("#acSummary")).toHaveText(/^\d+ of 1\d\d obtained · \d+ of \d+ points$/);
  await expect(log).not.toHaveAttribute("open");
  await log.locator("summary").click();
  await expect(log.locator(".ac-row").first()).toContainText(`${CAUGHT.length} / `);
  await page.reload();
  await expect(page.locator('.ac-section[data-section="log"]')).toHaveAttribute("open");
  expect(errors).toEqual([]);
});

test("hand-tracked achievements can be marked obtained", async ({ page }) => {
  await openApp(page, { path: "#achievements", storage: { "odd-achievements-open": ["milestones"] } });
  const box = page.locator('.ac-section[data-section="milestones"] input[data-mark]').first();
  await box.check();
  const id = Number(await box.getAttribute("data-mark"));
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("odd-achievements-v1")))).toContain(id);
  await expect(page.locator(`.ac-row[data-id="${id}"]`)).toHaveClass(/done/);
});

test("meta achievements group their parts; groups collapse and stay collapsed", async ({ page }) => {
  await openApp(page, { path: "#achievements", storage: { "odd-achievements-open": ["log", "big", "ocean", "milestones", "other"] } });
  const group = page.locator("details.ac-group").first();
  await expect(group).toHaveAttribute("open");
  await expect(group.locator(".ac-children .ac-row").first()).toBeVisible();
  await group.locator("> summary .ac-name").click();
  await expect(group).not.toHaveAttribute("open");
  await page.reload();
  await expect(page.locator("details.ac-group").first()).not.toHaveAttribute("open");
});

test("ocean spot achievements show their fish, which open the fish view", async ({ page }) => {
  await openApp(page, { path: "#achievements", storage: { "odd-achievements-open": ["ocean"] } });
  const fish = page.locator('.ac-section[data-section="ocean"] .ac-f');
  await expect(fish.first()).toBeVisible();
  await fish.first().click();
  await expect(page.locator("#fishDialog")).toBeVisible();
});

test("imported in-game progress shows on hand-tracked achievements", async ({ page }) => {
  await openApp(page, { path: "#achievements", storage: { "odd-achievements-open": ["milestones", "ocean", "other"] } });
  await page.locator("#acImportBtn").click();
  const id = Number(await page.locator(".ac-section input[data-mark]").first().getAttribute("data-mark"));
  await page.locator("#importText").fill(JSON.stringify({ source: "OfDragonsDeep", version: 2, fish: [], achievements: [{ id, complete: false, current: 312, max: 500 }] }));
  await page.locator("#importGo").click();
  await expect(page.locator(`.ac-row[data-id="${id}"] .ac-progress`)).toContainText("312 / 500 in game");
  await expect(page.locator("#acImported")).toContainText("Last imported from the plugin");
});
