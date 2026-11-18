import { encodeImportLink } from "../../src/lib/importFormat.js";
import { expect, exportJson, gridReady, openApp, test } from "./fixtures.js";

const NEW = [4776, 4869, 4870, 7678, 12713, 4925, 4926, 4927, 4928, 4929, 4930, 4931, 20144];

test("an import plays the reveal, then shows the summary", async ({ page }) => {
  const errors = await openApp(page);
  await gridReady(page);
  await page.locator("#importBtn").click();
  await expect(page.locator("#importText")).toBeFocused();
  await page.locator("#importText").fill(exportJson(NEW, [{ id: 2557, complete: true }, { id: 2558, complete: false, current: 5, max: 10 }]));
  await page.locator("#importGo").click(); // nothing to unmark: no second click needed

  const reveal = page.locator("#gachaDialog");
  await expect(reveal).toHaveClass(/bite/);                       // the bobber gets a bite…
  await expect(reveal).toHaveClass(/done/, { timeout: 15_000 });  // …and the cards end up face up
  await expect(reveal.locator(".gc-card.flipped")).toHaveCount(10);
  await expect(reveal.locator(".gc-mini")).toHaveCount(3);
  await expect(reveal.locator("#gcCount")).toHaveText("13");
  await expect(reveal.locator(".gc-card").first()).toHaveClass(/big|coll/); // best first

  await reveal.locator(".gc-title").click();                      // a tap beside the cards doesn't close it
  await page.keyboard.press("Escape");
  await expect(reveal).toBeVisible();

  await reveal.locator(".gc-card").first().click();               // a card turns over to its details
  await expect(reveal.locator(".gc-zoom")).toHaveClass(/on/);
  await expect(reveal.locator(".gc-info .gc-facts")).toContainText("Location");
  await reveal.locator(".gc-details-btn").click();
  await expect(page.locator("#fishDialog")).toBeVisible();
  await page.locator("#fvClose").click();
  await page.keyboard.press("Escape");
  await expect(reveal.locator(".gc-zoom")).toBeHidden();

  await reveal.locator("#gcClose").click();
  await expect(reveal).toBeHidden();
  await expect(page.locator("#toast")).toHaveClass(/show/);
  await expect(page.locator("#toast")).toContainText("Marked 13 new fish as caught.");
  await expect(page.locator("#toast")).toContainText("1 achievement complete (1 new), progress for 1 more");
  await expect(page.locator("#caughtCount")).toHaveText("12");
  expect(errors).toEqual([]);
});

test("Replace asks before unmarking, then follows the export", async ({ page }) => {
  await openApp(page, { storage: { "odd-caught-v2": [4776, 4869], "odd-achievements-v1": [2557] } });
  await gridReady(page);
  await page.locator("#importBtn").click();
  await page.locator("#importText").fill(exportJson([4776], [{ id: 2557, complete: false }]));
  await page.locator("#importGo").click();
  await expect(page.locator("#importGo")).toHaveText("Unmark 1 fish + 1 achievement & import");
  await expect(page.locator("#importResult")).toContainText("unmark 1 fish and 1 achievement");
  await page.locator("#importGo").click();
  await expect(page.locator("#importDialog")).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Unmarked 1 fish not in the export.");
  await expect(page.locator("#caughtCount")).toHaveText("1");
  expect(await page.evaluate(() => localStorage.getItem("odd-achievements-v1"))).toBe("[]");
});

test("an import link fills in the dialog and waits for Import", async ({ page }) => {
  const link = await encodeImportLink({ fish: [4776, 4869], achievements: [{ id: 2557, complete: true }] });
  await openApp(page, { path: `?import=${link}#achievements` });
  await expect(page.locator("#importDialog")).toBeVisible();
  await expect(page.locator("#importResult")).toContainText("Loaded 2 fish and 1 completed achievements from your link.");
  await expect(page).toHaveURL(/\/#achievements$/); // the parameter is removed
  expect(JSON.parse(await page.locator("#importText").inputValue()).fish).toEqual([4776, 4869]);
  expect(await page.evaluate(() => localStorage.getItem("odd-caught-v2"))).toBeNull(); // nothing changed yet
});

test("old links and old exports ask for a plugin update", async ({ page }) => {
  await openApp(page, { path: "?import=1.abcdef" });
  await expect(page.locator("#importResult")).toContainText("older version of the Of Dragons Deep plugin");
  await page.locator("#importText").fill('{"source":"OfDragonsDeep","fish":[1]}');
  await page.locator("#importGo").click();
  await expect(page.locator("#importResult")).toContainText("older version");
});

test("with reduced motion the reveal shows the cards at once", async ({ browser }) => {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  await openApp(page);
  await gridReady(page);
  await page.locator("#importBtn").click();
  await page.locator("#importText").fill(exportJson([4776, 4869]));
  await page.locator("#importGo").click();
  await expect(page.locator("#gachaDialog")).toHaveClass(/done/, { timeout: 1000 });
  await expect(page.locator(".gc-card.flipped")).toHaveCount(2);
  await page.close();
});
