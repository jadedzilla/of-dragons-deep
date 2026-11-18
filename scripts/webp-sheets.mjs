#!/usr/bin/env node
// Converts the icon sprite sheets (src/assets/icons/sheet-NN.png, written by fetch-icons.mjs) to WebP and points
// src/data/icons.json at them. WebP at quality 0.82 is ~5× smaller (≈145 KB vs ≈750 KB per sheet) and visually
// indistinguishable at the size tiles are shown, so pages load much faster.
//
// Node can't encode WebP itself, so this uses headless Chromium via Playwright (a dev dependency).
// Runs as part of npm run fetch:icons.
import { readFile, writeFile, unlink } from "node:fs/promises";
import { chromium } from "@playwright/test";

const QUALITY = 0.82;
const root = new URL("..", import.meta.url);
const dir = new URL("src/assets/icons/", root);
const manifestUrl = new URL("src/data/icons.json", root);

const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
const browser = await chromium.launch();
const page = await browser.newPage();
let before = 0, after = 0;
const sheets = [];
for (const name of manifest.sheets) {
  if (!name.endsWith(".png")) { sheets.push(name); continue; } // already converted
  const png = await readFile(new URL(name, dir));
  const webp = await page.evaluate(async ([b64, q]) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    const out = c.toDataURL("image/webp", q);
    if (!out.startsWith("data:image/webp")) throw new Error("This browser can't encode WebP");
    // round-trip check: the WebP must decode to the same dimensions
    const back = new Image(); back.src = out; await back.decode();
    if (back.naturalWidth !== img.naturalWidth || back.naturalHeight !== img.naturalHeight) throw new Error("WebP size mismatch");
    return out.slice(out.indexOf(",") + 1);
  }, [png.toString("base64"), QUALITY]);
  const buf = Buffer.from(webp, "base64"), out = name.replace(/\.png$/, ".webp");
  await writeFile(new URL(out, dir), buf);
  await unlink(new URL(name, dir));
  before += png.length; after += buf.length;
  sheets.push(out);
}
await browser.close();
manifest.sheets = sheets;
await writeFile(manifestUrl, JSON.stringify(manifest));
console.log(before ? `Converted ${sheets.length} sheets to WebP: ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB` : "Sheets are already WebP");
