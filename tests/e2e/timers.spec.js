import { dataChunk, CAUGHT, T0, expect, openApp, test } from "./fixtures.js";

test("lists timed fish, up now first, with ticking countdowns", async ({ page }) => {
  const errors = await openApp(page, { path: "#timers", clock: { install: T0 }, storage: { "odd-caught-v2": CAUGHT } });
  await expect(page.locator("#tmClock")).toHaveText("05:42");
  const rows = page.locator(".tm-row");
  await expect(rows.first()).toBeVisible();
  await expect(page.locator("#tmSummary")).toHaveText(/^\d+ up now · \d+ of \d+ timed fish shown$/);

  // up-now rows come first and end soonest first; then upcoming, soonest start first
  const ups = await rows.evaluateAll(els => els.map(e => e.classList.contains("up")));
  expect(ups.indexOf(false)).toBe(ups.lastIndexOf(true) + 1);

  const first = rows.first().locator(".tm-status b");
  const before = await first.textContent();
  await page.clock.runFor(2000);
  await expect(first).not.toHaveText(before);
  expect(errors).toEqual([]);
});

test("filters: hide caught, big fish only, search", async ({ page }) => {
  await openApp(page, { path: "#timers", clock: T0 });
  await expect(page.locator(".tm-row").first()).toBeVisible();
  const all = await page.locator(".tm-row").count();
  await page.locator("#tmBigOnly").check();
  await expect.poll(() => page.locator(".tm-row").count()).toBeLessThan(all);
  await expect(page.locator(".tm-row .tm-big").first()).toBeVisible();
  await page.locator("#tmSearch").fill("zzzz");
  await expect(page.locator(".empty-msg")).toHaveText("No timed fish match.");
});

test("shows an error when the data can't load; try again reloads", async ({ page }) => {
  let fail = true;
  await page.route(dataChunk("teamcraft"), route => fail ? route.abort() : route.fallback());
  await openApp(page, { path: "#timers", clock: T0 });
  await expect(page.locator("#tmList .empty-msg")).toContainText("Couldn't load the catch windows");
  fail = false;
  await page.locator("#tmRetry").click();
  await expect(page.locator(".tm-row").first()).toBeVisible();
});
