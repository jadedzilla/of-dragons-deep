#!/usr/bin/env node
// Downloads the game icon for every fish in data/fish.json from XIVAPI and packs them into sprite sheets:
//   data/icons/sheet-00.png …  (10×10 icons of 80px each per sheet)
//   data/icons.json            ({ size, cols, sheets: [file…], icons: { iconId: index } })
// Icon i lives in sheet floor(i / 100), cell i % 100. Icons are ordered by first appearance in fish.json,
// so the default first page of the grid only needs the first sheet.
//
// Source: XIVAPI v2 asset endpoint, high-resolution (_hr1, 80×80) icons; falls back to the 40×40 icon, upscaled.
// Also writes data/icons/frame.png: the game's item-icon frame with its reflective shine (ui/uld/IconA_Frame_hr1.tex,
// top-left 96×96 cell; the 80px icon sits at 8,4 inside it), drawn over every tile.
// Requires Node 18+ and network access to v2.xivapi.com. Usage: npm run fetch-icons [-- --frame-only]
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { decodePng, encodePng } from "./png.mjs";

const SIZE = 80, COLS = 10, PER_SHEET = COLS * COLS, CONCURRENCY = 8;
const root = new URL("..", import.meta.url);
const outDir = new URL("data/icons/", root);

const iconPath = (id, hr) => {
  const s = String(id).padStart(6, "0");
  return `ui/icon/${s.slice(0, 3)}000/${s}${hr ? "_hr1" : ""}.tex`;
};
const iconUrl = (id, hr) => `https://v2.xivapi.com/api/asset?path=${encodeURIComponent(iconPath(id, hr))}&format=png`;

async function download(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i >= tries) throw new Error(`${url}: ${e.message}`);
      await new Promise(res => setTimeout(res, 500 * 2 ** i));
    }
  }
}

/** Nearest-neighbour scale of an RGBA image to SIZE×SIZE (only used for the rare 40px fallback). */
function toSize(img) {
  if (img.width === SIZE && img.height === SIZE) return img;
  const data = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const sx = Math.floor(x * img.width / SIZE), sy = Math.floor(y * img.height / SIZE);
    img.data.copy(data, (y * SIZE + x) * 4, (sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4);
  }
  return { width: SIZE, height: SIZE, data };
}

async function fetchIcon(id) {
  const hr = await download(iconUrl(id, true));
  if (hr) return { img: toSize(decodePng(hr)), hr: true };
  const lr = await download(iconUrl(id, false));
  return lr ? { img: toSize(decodePng(lr)), hr: false } : null;
}

const FRAME_CELL = 96;
async function fetchFrame() {
  const url = `https://v2.xivapi.com/api/asset?path=${encodeURIComponent("ui/uld/IconA_Frame_hr1.tex")}&format=png`;
  const buf = await download(url);
  if (!buf) throw new Error("Icon frame not found: " + url);
  const atlas = decodePng(buf), data = Buffer.alloc(FRAME_CELL * FRAME_CELL * 4);
  for (let y = 0; y < FRAME_CELL; y++) atlas.data.copy(data, y * FRAME_CELL * 4, y * atlas.width * 4, (y * atlas.width + FRAME_CELL) * 4);
  await mkdir(outDir, { recursive: true });
  await writeFile(new URL("frame.png", outDir), encodePng({ width: FRAME_CELL, height: FRAME_CELL, data }));
  return "frame.png";
}

if (process.argv.includes("--frame-only")) {
  const manifestUrl = new URL("data/icons.json", root);
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  manifest.frame = await fetchFrame();
  await writeFile(manifestUrl, JSON.stringify(manifest));
  console.log("Wrote data/icons/frame.png");
  process.exit(0);
}

const { rows } = JSON.parse(await readFile(new URL("data/fish.json", root), "utf8"));
const ids = [...new Set(rows.map(r => r[2]).filter(Boolean))];
console.log(`Downloading ${ids.length} icons from v2.xivapi.com …`);

const results = new Array(ids.length);
let next = 0, done = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < ids.length) {
    const i = next++;
    results[i] = await fetchIcon(ids[i]);
    if (++done % 100 === 0 || done === ids.length) process.stdout.write(`  ${done}/${ids.length}\r`);
  }
}));
console.log();

const found = ids.map((id, i) => [id, results[i]]).filter(([, r]) => r);
const missing = ids.filter((_, i) => !results[i]);
const lowRes = found.filter(([, r]) => !r.hr).map(([id]) => id);

await mkdir(outDir, { recursive: true });
for (const f of await readdir(outDir)) if (/^sheet-\d+\.png$/.test(f)) await unlink(new URL(f, outDir));

const sheets = [], icons = {};
for (let s = 0; s * PER_SHEET < found.length; s++) {
  const W = COLS * SIZE, data = Buffer.alloc(W * W * 4); // always full 10×10 so CSS positions are uniform
  found.slice(s * PER_SHEET, (s + 1) * PER_SHEET).forEach(([id, { img }], k) => {
    const ox = (k % COLS) * SIZE, oy = Math.floor(k / COLS) * SIZE;
    for (let y = 0; y < SIZE; y++) img.data.copy(data, ((oy + y) * W + ox) * 4, y * SIZE * 4, (y + 1) * SIZE * 4);
    icons[id] = s * PER_SHEET + k;
  });
  const file = `sheet-${String(s).padStart(2, "0")}.png`;
  await writeFile(new URL(file, outDir), encodePng({ width: W, height: W, data }));
  sheets.push(file);
}

const frame = await fetchFrame();
const manifest = { source: "https://v2.xivapi.com/api/asset", fetched: new Date().toISOString().slice(0, 10), size: SIZE, cols: COLS, sheets, frame, icons };
await writeFile(new URL("data/icons.json", root), JSON.stringify(manifest));
console.log(`Wrote ${sheets.length} sheets with ${found.length} icons to data/icons/`);
if (lowRes.length) console.log(`  ${lowRes.length} icon(s) only available at 40px (upscaled): ${lowRes.join(", ")}`);
if (missing.length) console.log(`  ${missing.length} icon(s) not found (placeholder used): ${missing.join(", ")}`);
