#!/usr/bin/env node
// Bundles the app into one self-contained file: dist/index.html (CSS, JS, icons and the fallback fish snapshot inlined;
// fish data is still fetched live at runtime when the source is reachable).
// Handy for hosting anywhere static or sharing as a single file. Usage: npm run build
//   --external-icons  keep the icon sprite sheets as separate files in dist/icons/ instead of inlining them
//                     (smaller HTML that renders sooner; sheets load only when needed). Their URLs carry a
//                     content hash (?v=…), so browsers never reuse a stale cached sheet after a deploy.
//
// Bundling is deliberately simple: modules are concatenated in dependency order with their
// `import` lines and `export` keywords stripped. Keep imports on a single line each.
import { readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("..", import.meta.url);
const read = p => readFile(new URL(p, root), "utf8");
const MODULES = ["src/storage.js", "src/skeleton.js", "src/icons.js", "src/fishsource.js", "src/data.js", "src/teamcraft.js", "src/timers.js", "src/achievements.js", "src/logroute.js", "src/share.js", "src/baits.js", "src/gacha.js", "src/main.js"];

const js = (await Promise.all(MODULES.map(read)))
  .map((src, i) => `// ---- ${MODULES[i]} ----\n` + src.replace(/^import .*$/gm, "").replace(/^export /gm, ""))
  .join("\n");
const data = await read("data/fish.json");
const baits = (await read("data/baits.json")).trim();
const css = await read("src/styles.css");
const externalIcons = process.argv.includes("--external-icons");
const icons = JSON.parse(await read("data/icons.json"));
await mkdir(new URL("dist/", root), { recursive: true });
if (externalIcons) {
  await rm(new URL("dist/icons/", root), { recursive: true, force: true }); // drop sheets from older builds
  await mkdir(new URL("dist/icons/", root), { recursive: true });
  for (const s of icons.sheets) await copyFile(new URL(`data/icons/${s}`, root), new URL(`dist/icons/${s}`, root));
  // Same file name, new content (e.g. a sheet gaining icons) must not be served from a browser's cache.
  const version = async s => createHash("sha1").update(await readFile(new URL(`data/icons/${s}`, root))).digest("hex").slice(0, 10);
  icons.sheets = await Promise.all(icons.sheets.map(async s => `icons/${s}?v=${await version(s)}`));
} else {
  icons.sheets = await Promise.all(icons.sheets.map(async s =>
    `data:image/${s.endsWith(".webp") ? "webp" : "png"};base64,` + (await readFile(new URL(`data/icons/${s}`, root))).toString("base64")));
}
let html = await read("index.html");

html = html
  .replace('<link rel="stylesheet" href="src/styles.css">', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="src/main.js"></script>',
    () => `<script>window.__FISH_DATA__ = ${data};\n${externalIcons ? "" : `window.__BAIT_DATA__ = ${baits};\n`}window.__ICON_DATA__ = ${JSON.stringify(icons)};</script>\n<script type="module">\n${js}</script>`);

// Web app manifest (home-screen install): copied with the icons it lists for --external-icons. The single file drops
// it: an app can't be installed from a file opened from disk, and a data: manifest has no origin to resolve against.
if (externalIcons) {
  const manifest = JSON.parse(await read("manifest.webmanifest"));
  await copyFile(new URL("manifest.webmanifest", root), new URL("dist/manifest.webmanifest", root));
  await mkdir(new URL("dist/public/", root), { recursive: true });
  for (const icon of manifest.icons) await copyFile(new URL(icon.src, root), new URL(`dist/${icon.src}`, root));
} else {
  html = html.replace(/<link rel="manifest"[^>]*>\n?/, "");
}

// Files from public/ referenced by the page (favicon, apple-touch-icon): inlined as data: URIs in the single file,
// copied next to the page with --external-icons.
for (const path of new Set([...html.matchAll(/(?:href|src)="(public\/[^"]+)"/g)].map(m => m[1]))) {
  if (externalIcons) {
    await mkdir(new URL("dist/public/", root), { recursive: true });
    await copyFile(new URL(path, root), new URL(`dist/${path}`, root));
  } else {
    const type = { png: "image/png", jpg: "image/jpeg", svg: "image/svg+xml", webp: "image/webp", ico: "image/x-icon" }[path.split(".").pop()] ?? "application/octet-stream";
    const uri = `data:${type};base64,` + (await readFile(new URL(path, root))).toString("base64");
    html = html.replaceAll(`"${path}"`, `"${uri}"`);
  }
}

// Bait sources: inlined in the single file; a separate file for Pages (loaded only when a bait is opened).
if (externalIcons) {
  await mkdir(new URL("dist/data/", root), { recursive: true });
  await copyFile(new URL("data/baits.json", root), new URL("dist/data/baits.json", root));
}

await writeFile(new URL("dist/index.html", root), html);
console.log(`Wrote dist/index.html (${(html.length / 1024).toFixed(0)} KB)` + (externalIcons ? ` + ${icons.sheets.length} sheets in dist/icons/` : ""));
