#!/usr/bin/env node
// Makes the home-screen icons from the transparent Nepto Dragon (public/neptodragon-icon-clean-512x.png): the dragon
// on the app's dark blue background (home screens show transparency as black or white), pixel art scaled without
// smoothing. Writes public/app-icon-180.png (iOS apple-touch-icon), app-icon-192.png and app-icon-512.png (manifest)
// and app-icon-maskable-512.png (Android adaptive icons crop to a circle, so the dragon sits in the middle 60%).
// Uses headless Chromium via Playwright (a dev dependency): `npm run app-icons`.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url);
const src = (await readFile(new URL("public/neptodragon-icon-clean-512x.png", root))).toString("base64");
const ICONS = [["app-icon-180.png", 180, 0.8], ["app-icon-192.png", 192, 0.8], ["app-icon-512.png", 512, 0.8], ["app-icon-maskable-512.png", 512, 0.6]];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, scale] of ICONS) {
  const b64 = await page.evaluate(async ([src, size, scale]) => {
    const img = new Image();
    img.src = "data:image/png;base64," + src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const bg = g.createRadialGradient(size / 2, 0, 0, size / 2, 0, size * 1.1); // like the page: lighter at the top
    bg.addColorStop(0, "#22304f");
    bg.addColorStop(0.6, "#0d1220");
    g.fillStyle = bg;
    g.fillRect(0, 0, size, size);
    g.imageSmoothingEnabled = false;
    const d = Math.round(size * scale), o = Math.round((size - d) / 2);
    g.drawImage(img, o, o, d, d);
    return c.toDataURL("image/png").split(",")[1];
  }, [src, size, scale]);
  await writeFile(new URL(`public/${name}`, root), Buffer.from(b64, "base64"));
  console.log(`public/${name} (${size}×${size})`);
}
await browser.close();
