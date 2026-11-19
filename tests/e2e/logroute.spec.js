import { gunzipSync } from "node:zlib";
import { T0, expect, openApp, test } from "./fixtures.js";

test("plans the route: summary, Next step, bait to bring", async ({ page }) => {
  const errors = await openApp(page, { path: "#route", clock: T0 });
  await expect(page.locator(".lr-step").first()).toBeVisible();
  await expect(page.locator(".lr-stat").first()).toContainText("fish left · 0 / ");
  await expect(page.locator(".lr-step").first().locator(".lr-when")).toHaveText("Next");
  await expect(page.locator(".lr-step").first()).toContainText("Bring:");
  await expect(page.locator(".lr-step")).toHaveCount(15);
  await expect(page.locator(".lr-leftout", { hasText: "timed fish" })).toContainText("timed fish not in the route"); // timed fish are off by default
  await page.locator("#lrMore").click();
  await expect(page.locator(".lr-step")).toHaveCount(30);
  expect(errors).toEqual([]);
});

test("✓ marks a fish caught and drops it without re-planning", async ({ page }) => {
  await openApp(page, { path: "#route", clock: T0 });
  const firstFish = page.locator(".lr-f").first();
  await expect(firstFish).toBeVisible();
  const id = Number(await firstFish.locator("[data-mark]").getAttribute("data-mark"));
  const second = await page.locator(".lr-f").nth(1).locator("[data-mark]").getAttribute("data-mark");
  await firstFish.locator("[data-mark]").click();
  await expect(page.locator(".lr-f").first().locator("[data-mark]")).toHaveAttribute("data-mark", second);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("odd-caught-v2")))).toContain(id);
});

test("timed fish: countdowns tick, a closed window drops out and Re-plan fits it back", async ({ page }) => {
  await openApp(page, { path: "#route", clock: { install: T0 }, storage: { "odd-route-timed": "1" } });
  const timed = page.locator(".lr-step.timed").first();
  await expect(timed).toBeVisible();
  const countdown = timed.locator(".lr-countdown");
  const before = await countdown.textContent();
  await page.clock.runFor(2000);
  await expect(countdown).not.toHaveText(before);

  await page.clock.fastForward("06:00:00"); // jump ahead: some windows have closed by then
  await expect(page.locator(".lr-missed")).toContainText("missed");
  await page.locator("#lrRecalc").click();
  await expect(page.locator(".lr-missed")).toHaveCount(0);
});

test("Include timed fish is remembered", async ({ page }) => {
  await openApp(page, { path: "#route", clock: T0 });
  await expect(page.locator(".lr-step").first()).toBeVisible();
  await page.locator("#lrTimed").check();
  await expect(page.locator(".lr-leftout", { hasText: "timed fish" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#lrTimed")).toBeChecked();
});

test("Include big fish is ticked by default; unticking leaves them out and is remembered", async ({ page }) => {
  await openApp(page, { path: "#route", clock: T0 });
  await expect(page.locator(".lr-step").first()).toBeVisible();
  await expect(page.locator("#lrBig")).toBeChecked();
  await expect(page.locator(".lr-leftout", { hasText: "big fish" })).toHaveCount(0);
  await page.locator("#lrBig").uncheck();
  await expect(page.locator(".lr-leftout", { hasText: "big fish" })).toContainText(/^\d+ big fish not in the route/);
  await page.reload();
  await expect(page.locator("#lrBig")).not.toBeChecked();
});

test("Include custom delivery fish is off by default; ticking adds them and is remembered", async ({ page }) => {
  await openApp(page, { path: "#route", clock: T0 });
  await expect(page.locator(".lr-step").first()).toBeVisible();
  await expect(page.locator("#lrDelivery")).not.toBeChecked();
  await expect(page.locator(".lr-leftout", { hasText: "custom delivery" })).toContainText(/^10 custom delivery fish not in the route/);
  await page.locator("#lrDelivery").check();
  await expect(page.locator(".lr-leftout", { hasText: "custom delivery" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#lrDelivery")).toBeChecked();
});

test("GatherBuddy copies the route as an auto-gather list", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openApp(page, { path: "#route", clock: T0 });
  await expect(page.locator(".lr-step").first()).toBeVisible();
  await page.locator("#lrGbrAll").click();
  await expect(page.locator("#lrGbrAll")).toHaveText("Copied!");
  const bytes = gunzipSync(Buffer.from(await page.evaluate(() => navigator.clipboard.readText()), "base64"));
  expect(bytes[0]).toBe(6);
  const list = JSON.parse(bytes.subarray(1).toString("utf8"));
  expect(list.Name).toMatch(/^Of Dragons Deep · Log route \(\d+ fish\)$/);
  expect(list.Enabled).toBe(false);
  expect(Object.keys(list.PrefferedLocations).length).toBe(list.ItemIds.length);
  await expect(page.locator("#lrGbrAll")).toHaveText("GatherBuddy", { timeout: 5000 });
});

test("GatherBuddy is desktop only", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await openApp(page, { path: "#route", clock: T0 });
  await expect(page.locator(".lr-step").first()).toBeVisible();
  await expect(page.locator("#lrGbrAll")).toBeHidden();
  await page.close();
});
