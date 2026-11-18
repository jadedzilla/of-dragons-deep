import { expect, gridReady, openApp, test } from "./fixtures.js";

test("the fish view shows facts, bait, hookset, tug, canvas and the description", async ({ page }) => {
  const errors = await openApp(page, { storage: { "odd-caught-v2": [4776] } });
  await gridReady(page);
  await page.locator('.tile[data-id="4776"]').click();
  const view = page.locator("#fishDialog");
  await expect(view.locator("#fvName")).toHaveText("Malm Kelp");
  await expect(view.locator("#fvTags")).toContainText("✓ Caught");
  await expect(view.locator("#fvFacts")).toContainText("Location");
  await expect(view.locator("#fvFacts")).toContainText("Item ID4776");
  await expect(view.locator("#fvBait .fv-bait-item").first()).toBeVisible();
  await expect(view.locator("#fvHook")).not.toHaveClass(/pending/);
  await expect(view.locator("#fvTug")).toHaveText(/\((!+)\)/);
  await expect(view.locator("#fvCanvas")).not.toContainText("Unavailable");
  await expect(view.locator("#fvDesc div").first()).toBeVisible();
  await expect(view.locator("#fvDesc")).not.toContainText("[Suitable for"); // shown as facts instead
  await page.keyboard.press("Escape");
  await expect(view).toBeHidden();
  expect(errors).toEqual([]);
});

test("a fish without a recorded description says so", async ({ page }) => {
  await openApp(page);
  await gridReady(page);
  await page.locator(".tile[data-id]").nth(5).click();
  await expect(page.locator("#fvDesc")).toHaveText("Description unavailable right now.");
  await expect(page.locator("#fvCanvas")).toHaveText("Unavailable right now");
});

test("clicking a bait shows where to get it, over the fish view", async ({ page }) => {
  await openApp(page);
  await gridReady(page);
  await page.locator('.tile[data-id="4776"]').click();
  await page.locator("#fishDialog .bait-link").first().click();
  const bait = page.locator("#baitDialog");
  await expect(bait.locator("#bvName")).not.toBeEmpty();
  await expect(bait.locator("h3").first()).toHaveText(/Sold by|Crafted by/);
  await expect(bait.locator(".bv-list li").first()).toBeVisible();
  await bait.locator("#bvClose").click();
  await expect(bait).toBeHidden();
  await expect(page.locator("#fishDialog")).toBeVisible();
});
