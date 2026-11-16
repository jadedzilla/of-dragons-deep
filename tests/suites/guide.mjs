// Fish Guide page: data + grid, paging, search, filters, tabs, legend, tooltip, layout, offline fallback.
import { gridReady, search, tileIds, text, noOverflow } from "../lib/app.mjs";

export default async function (t) {
  const p = await t.page();
  await gridReady(p);

  // data + grid
  t.check("live data: 1517 fish, footer names XIVAPI", await text(p, "#totalCount") === "1517" && /^1517 fish · live game data from XIVAPI/.test(await text(p, "#dataNote")), await text(p, "#dataNote"));
  const ids = await tileIds(p);
  t.check("10×10 grid in log order (Malm Kelp first)", ids.length === 100 && ids[0] === 4776);
  t.check("page numbers: 16 pages", await p.$$eval("#pages .pg:not(.arrow)", b => b.at(-1).textContent) === "16");
  await p.waitForFunction(() => document.querySelectorAll(".tile .ic.ready").length >= 90);
  t.check("icons come from the WebP sprite sheets", await p.evaluate(() => getComputedStyle(document.querySelector(".tile .ic")).backgroundImage.includes(".webp")));
  t.check("title bar", await text(p, ".titlebar h1") === "Of Dragons Deep");

  // paging: arrows and search never move
  const pos = () => p.evaluate(() => ["#pages .pg.arrow:first-child", "#pages .pg.arrow:last-child", "#search"].map(s => Math.round(document.querySelector(s).getBoundingClientRect().left)).join());
  const seen = new Set([await pos()]), active = new Set();
  for (let i = 0; i < 15; i++) { await p.click("#pages .pg.arrow:last-child"); seen.add(await pos()); active.add(await text(p, "#pages .pg.active")); }
  t.check("paging through all 16 pages: arrows and search stay put", seen.size === 1 && active.size === 15, [...seen]);
  t.check("last page has 17 fish", (await tileIds(p)).length === 17);
  await p.click("#pages .pg >> text=\"1\"");

  // search: collapsed icon → expands → filters → collapses
  const box = () => p.$eval("#search", e => Math.round(e.getBoundingClientRect().width));
  t.check("search starts as a 30px icon", await box() === 30);
  await p.click("#search");
  await p.waitForFunction(() => document.querySelector("#search").getBoundingClientRect().width > 80);
  await p.keyboard.type("sculpin");
  await p.waitForFunction(() => document.querySelectorAll(".tile[data-id]").length === 5);
  t.check("search filters (sculpin → 5)", true);
  await search(p, ""); await p.mouse.click(3, 3);
  await p.waitForFunction(() => document.querySelector("#search").getBoundingClientRect().width === 30);
  t.check("emptied search collapses again, all fish back", (await tileIds(p)).length === 100);

  // filters
  await p.click("#filterBtn"); await p.check("#bigOnly"); await p.mouse.click(3, 3);
  await p.waitForFunction(() => [...document.querySelectorAll(".tile[data-id]")].every(t => t.classList.contains("big")));
  t.check("Big fish only: filter badge 1, every tile big", await text(p, "#filterCount") === "1");
  await p.click("#filterBtn"); await p.click("#resetFilters"); await p.mouse.click(3, 3);
  t.check("Reset filters", (await tileIds(p)).length === 100 && await text(p, "#filterCount") === "0");

  // tooltip
  await p.hover('.tile[data-id="4776"]');
  t.check("hover tooltip names the fish", /Malm Kelp/.test(await text(p, "#tooltip")));

  // tabs + legend
  const legend = () => p.evaluate(() => [".legend span:last-child", "#bigLegend"].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)}`; }).join(" "));
  const before = await legend();
  await p.click("[data-mode=spear]");
  await p.waitForFunction(() => document.querySelector("#totalCount").textContent === "289");
  t.check("Spearfishing tab: 289, Wentletrap first, 3 pages", (await tileIds(p))[0] === 20144 && await p.$$eval("#pages .pg:not(.arrow)", b => b.length) === 3);
  t.check("legend doesn't move between tabs; Big fish hidden for spearfish", await legend() === before && await p.$eval("#bigLegend", e => getComputedStyle(e).visibility) === "hidden");
  await p.reload(); await gridReady(p);
  t.check("tab remembered after reload", await text(p, "#totalCount") === "289");
  t.noErrors(p, "desktop");

  // phone layout
  const ph = await t.page({ width: 375, height: 800 });
  await gridReady(ph);
  const lay = await ph.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect(), row2 = ["#search", "#editBtn", "#importBtn", "#filterBtn"].map(s => Math.round(r(s).top));
    return { pagesAlone: r("#pages").bottom <= Math.min(...row2), oneRow: new Set(row2).size === 1, filterRight: Math.abs(r("#filterBtn").right - r(".toolbar").right) < 1.5 };
  });
  t.check("phone: pages on row 1; search/Edit/Import/Filter on row 2, Filter at the right", lay.pagesAlone && lay.oneRow && lay.filterRight, lay);
  t.check("phone: no horizontal overflow", await noOverflow(ph));
  await t.shot(ph, "phone");
  t.noErrors(ph, "phone");

  // XIVAPI down → snapshot fallback, amber note
  const off = await t.page({ path: null });
  await off.route(/v2\.xivapi\.com\/api\/sheet\/(FishParameter|SpearfishingItem|AquariumFish)/, r => r.abort());
  await off.goto(t.url); await gridReady(off);
  t.check("XIVAPI down: snapshot used, amber 'offline snapshot' note", /offline snapshot/.test(await text(off, "#dataNote")) && await off.$eval("#dataNote", e => e.classList.contains("offline")) && (await tileIds(off)).length === 100);
}
