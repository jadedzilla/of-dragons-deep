import { dataChunk, CAUGHT, expect, openApp, test } from "./fixtures.js";

test("draws the progress card and downloads it", async ({ page }) => {
  const errors = await openApp(page, { path: "#share", storage: { "odd-caught-v2": CAUGHT, "odd-achievements-v1": [2557] } });
  const img = page.locator("#shImg");
  await expect(img).toBeVisible();
  expect(await img.evaluate(i => [i.naturalWidth, i.naturalHeight])).toEqual([1200, 675]);
  await expect(img).toHaveAttribute("alt", /^Of Dragons Deep: 6 \/ 1,\d{3} Fish Guide fish, 1 \/ \d+ spearfish, .* achievements \(\d+ points\)$/);
  const download = page.waitForEvent("download");
  await page.locator("#shDownload").click();
  expect((await download).suggestedFilename()).toMatch(/^of-dragons-deep-\d{4}-\d\d-\d\d\.png$/);
  await expect(page.locator("#shStatus")).toHaveText("Saved.");
  expect(errors).toEqual([]);
});

test("the card is transparent around the torn paper", async ({ page }) => {
  await openApp(page, { path: "#share" });
  await expect(page.locator("#shImg")).toBeVisible();
  const alpha = await page.locator("#shImg").evaluate(img => {
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    return [g.getImageData(2, 2, 1, 1).data[3], g.getImageData(600, 300, 1, 1).data[3]];
  });
  expect(alpha).toEqual([0, 255]);
});

test("remembers the name and redraws with it", async ({ page }) => {
  await openApp(page, { path: "#share" });
  await expect(page.locator("#shImg")).toBeVisible();
  const src = await page.locator("#shImg").getAttribute("src");
  await page.locator("#shName").fill("Aya Fisher");
  await expect(page.locator("#shImg")).not.toHaveAttribute("src", src);
  await page.reload();
  await expect(page.locator("#shName")).toHaveValue("Aya Fisher");
});

test("without achievements the card still shows the fish", async ({ page }) => {
  await page.route(dataChunk("achievements"), route => route.abort());
  await openApp(page, { path: "#share" });
  await expect(page.locator("#shImg")).toHaveAttribute("alt", /spearfish, \d+ \/ \d+ big fish$/);
});

test("redraws the card in the new colours when the theme is switched", async ({ page }) => {
  await openApp(page, { path: "#share", storage: { "odd-theme": "light" } });
  const img = page.locator("#shImg");
  await expect(img).toBeVisible();
  const paper = () => img.evaluate(i => new Promise(res => {
    const read = () => { const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight;
      const g = c.getContext("2d"); g.drawImage(i, 0, 0); res([...g.getImageData(600, 640, 1, 1).data].slice(0, 3)); };
    i.complete ? read() : i.addEventListener("load", read, { once: true });
  }));
  const light = await paper();
  const src = await img.getAttribute("src");
  await page.locator("#themeBtn").click();
  await expect(img).not.toHaveAttribute("src", src);
  const dark = await paper();
  expect(dark[0]).toBeLessThan(light[0] - 50); // the paper went dark
});
