// The builds: the single-file dist/index.html (opened from disk) and --external-icons (GitHub Pages).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gridReady, goTo, tileIds, text } from "../lib/app.mjs";

const run = promisify(execFile);
const ROOT = new URL("../../", import.meta.url);
const build = (...args) => run(process.execPath, [fileURLToPath(new URL("scripts/build.mjs", ROOT)), ...args]);
const DIST = new URL("dist/index.html", ROOT).href;

export default async function (t) {
  // single file: everything inlined, works from disk
  await build();
  const html = await readFile(new URL("dist/index.html", ROOT), "utf8");
  t.check("single file: scripts, styles, data and sheets inlined", !/<script[^>]+src=/.test(html) && !/href="src\/styles\.css"/.test(html)
    && html.includes("__FISH_DATA__") && /data:image\/webp;base64,/.test(html), (await stat(new URL("dist/index.html", ROOT))).size);
  t.check("single file: favicon inlined", /<link rel="icon" type="image\/png" href="data:image\/png;base64,/.test(html) && !html.includes('"public/'));
  const p = await t.page({ path: DIST });
  await gridReady(p);
  t.check("single file opens from disk: 100 tiles, icons ready", (await tileIds(p)).length === 100
    && await p.waitForFunction(() => document.querySelectorAll(".tile .ic.ready").length >= 90).then(() => true));
  await goTo(p, "achievements");
  await p.waitForSelector(".ac-row", { state: "attached" });
  await p.click("#acImportBtn"); await p.fill("#acImportText", "[x] On a Boat I"); await p.click("#acImportGo");
  t.check("single file: the other pages work (achievement import)", /^Imported 1 completed achievement\./.test(await text(p, "#acImportResult")));
  t.noErrors(p, "single file");

  // a fish whose icon isn't in the sheets: loads from XIVAPI, else a placeholder
  const malmKelpIcon = JSON.parse(await readFile(new URL("data/fish.json", ROOT), "utf8")).rows.find(r => r[0] === 4776)[2];
  const withoutIcon = async () => {
    const page = await t.page({ path: null });
    await page.addInitScript(icon => { let v; Object.defineProperty(window, "__ICON_DATA__", { configurable: true, get: () => v, set: x => { delete x.icons[icon]; v = x; } }); }, malmKelpIcon);
    return page;
  };
  const xiv = await withoutIcon();
  await xiv.goto(DIST); await gridReady(xiv);
  await xiv.waitForSelector('.tile[data-id="4776"] img.ic.ready', { state: "attached" });
  t.check("an icon missing from the sheets loads from XIVAPI", true);
  const fb = await withoutIcon();
  await fb.route(/\/api\/asset/, r => r.abort());
  await fb.goto(DIST); await gridReady(fb);
  await fb.waitForSelector('.tile[data-id="4776"] svg', { state: "attached" });
  t.check("…and falls back to a placeholder when XIVAPI fails", true);

  // external icons (GitHub Pages): sheets are separate files with a content hash
  await build("--external-icons");
  const ext = await readFile(new URL("dist/index.html", ROOT), "utf8");
  const sheets = [...ext.matchAll(/icons\/(sheet-\d+\.webp)\?v=([0-9a-f]{10})/g)];
  t.check("external icons build: favicon copied next to the page", ext.includes('href="public/neptodragon-icon-clean-512x.png"') && !!(await stat(new URL("dist/public/neptodragon-icon-clean-512x.png", ROOT))));
  t.check("external icons: 13 sheets with ?v= content hashes", sheets.length === 13 && (await Promise.all(sheets.map(m => stat(new URL(`dist/icons/${m[1]}`, ROOT))))).length === 13, sheets.length);
}
