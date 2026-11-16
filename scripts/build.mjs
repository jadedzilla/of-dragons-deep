#!/usr/bin/env node
// Bundles the app into one self-contained file: dist/index.html (CSS, JS and fish data inlined).
// Handy for hosting anywhere static or sharing as a single file. Usage: npm run build
//
// Bundling is deliberately simple: modules are concatenated in dependency order with their
// `import` lines and `export` keywords stripped. Keep imports on a single line each.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = p => readFile(new URL(p, root), "utf8");
const MODULES = ["src/storage.js", "src/icons.js", "src/data.js", "src/main.js"];

const js = (await Promise.all(MODULES.map(read)))
  .map((src, i) => `// ---- ${MODULES[i]} ----\n` + src.replace(/^import .*$/gm, "").replace(/^export /gm, ""))
  .join("\n");
const data = await read("data/fish.json");
const css = await read("src/styles.css");
let html = await read("index.html");

html = html
  .replace('<link rel="stylesheet" href="src/styles.css">', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="src/main.js"></script>',
    () => `<script>window.__FISH_DATA__ = ${data};</script>\n<script type="module">\n${js}</script>`);

await mkdir(new URL("dist/", root), { recursive: true });
await writeFile(new URL("dist/index.html", root), html);
console.log(`Wrote dist/index.html (${(html.length / 1024).toFixed(0)} KB)`);
