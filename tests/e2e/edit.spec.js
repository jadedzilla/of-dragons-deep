import { expect, gridReady, openApp, test } from "./fixtures.js";

test("a fish only changes while Edit is on; Edit is off on every load", async ({ page }) => {
  await openApp(page);
  await gridReady(page);
  const tile = page.locator('.tile[data-id="4776"]');
  await tile.click();
  await expect(page.locator("#fishDialog")).toBeVisible(); // view only: details
  await page.locator("#fvClose").click();
  await expect(tile).not.toHaveClass(/caught/);

  await page.locator("#editBtn").click();
  await expect(page.locator("#grid")).toHaveClass(/editing/);
  await tile.click();
  await expect(tile).toHaveClass(/caught/);
  await expect(page.locator("#caughtCount")).toHaveText("1");
  await page.reload();
  await expect(page.locator('.tile[data-id="4776"]')).toHaveClass(/caught/);
  await expect(page.locator("#editBtn")).not.toHaveClass(/on/);
});

test("Mark all caught / uncaught ask first and cover the whole tab", async ({ page }) => {
  await openApp(page);
  await gridReady(page);
  await page.locator("#editBtn").click();
  await page.locator("#markAllBtn").click();
  await expect(page.locator("#bulkCancel")).toBeFocused();
  await expect(page.locator("#bulkText")).toContainText("This marks all");
  await page.locator("#bulkGo").click();
  const total = await page.locator("#totalCount").textContent();
  await expect(page.locator("#caughtCount")).toHaveText(total);

  await page.locator("#markAllBtn").click();
  await expect(page.locator("#bulkGo")).toBeHidden(); // nothing to change
  await page.locator("#bulkCancel").click();

  await page.locator("#unmarkAllBtn").click();
  await expect(page.locator("#bulkGo")).toHaveClass(/danger/);
  await page.locator("#bulkGo").click();
  await expect(page.locator("#caughtCount")).toHaveText("0");
});
