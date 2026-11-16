#!/usr/bin/env node
// Converts the icon sprite sheets (data/icons/sheet-NN.png, written by fetch-icons.mjs) to WebP and points
// data/icons.json at them. WebP at quality 0.82 is ~5× smaller (≈145 KB vs ≈750 KB per sheet) and visually
// indistinguishable at the size tiles are shown, so pages load much faster.
//
// Node can't encode WebP itself, so this uses a headless Chromium via Playwright — a dev-only dependency that is
// needed just for refreshing icons; the app itself has no dependencies.
//   npm install && npx playwright install chromium   (once)
//   npm run fetch-icons                              (runs fetch-icons.mjs, then this)
import { readFile, writeFile, unlink } from "node:fs/promises";
import { createRequire } from "node:module";

const QUALITY = 0.82;
const root = new URL("..", import.meta.url);
const dir = new URL("data/icons/", root);
const manifestUrl = new URL("data/icons.json", root);

let chromium;
try { ({ chromium } = createRequire(import.meta.url)("playwright")); } // require() also honours NODE_PATH
catch { console.error("Playwright is needed to write WebP sheets: run `npm install && npx playwright install chromium`."); process.exit(1); }

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
