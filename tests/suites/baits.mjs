// Bait view: clicking a bait (fish view, Log Route) shows where to get it — vendors with places, coordinates and
// prices, and crafting — from data/baits.json. Mooch fish aren't bait chips.
import { readFile } from "node:fs/promises";
import { gridReady, search, text, noOverflow, T0 } from "../lib/app.mjs";
import { NET } from "../lib/network.mjs";

export default async function (t) {
  // data: every bait the routes use has an entry
  const baits = JSON.parse(await readFile(new URL("../../data/baits.json", import.meta.url), "utf8")).baits;
  const sources = Object.entries(NET.exact).find(([k]) => k.includes("fishing-sources.json"))[1];
  const used = [...new Set(Object.values(sources).flat().map(e => e.bait).filter(b => !(b in sources)))];
  t.check("data/baits.json covers every bait the routes use", used.every(b => baits[b]), used.filter(b => !baits[b]));
  t.check("vendors have a name, zone, map coordinates and a price", Object.values(baits).flatMap(b => b.vendors)
    .every(([npc, zone, x, y, price]) => npc && zone && x > 0 && y > 0 && price.length && price.every(([c, n]) => c > 0 && n > 0)));

  const p = await t.page({ width: 375, height: 900 });
  await gridReady(p);
  const openFish = async (name, id) => {
    if (await p.$eval("#fishDialog", d => d.open)) await p.keyboard.press("Escape");
    await search(p, name);
    await p.click(`.tile[data-id="${id}"]`);
    await p.waitForSelector("#fvBait .fv-bait-item");
  };
  const bait = () => p.evaluate(() => ({ open: document.querySelector("#baitDialog").open, name: document.querySelector("#bvName").textContent,
    heads: [...document.querySelectorAll("#bvBody h3")].map(h => h.textContent),
    rows: [...document.querySelectorAll("#bvBody > .bv-list li")].map(l => [...l.children].map(c => c.textContent.trim()).join(" ").replace(/\s+/g, " ")),
    more: document.querySelector(".bv-more summary")?.textContent ?? null, body: document.querySelector("#bvBody").textContent.replace(/\s+/g, " ") }));

  // fish view: Malm Kelp's Pill Bug
  await openFish("Malm Kelp", 4776);
  t.check("bait in the fish view is a clickable chip", await p.$$eval("#fvBait [data-bait]", b => b.map(x => x.textContent.trim()).join()) === "Pill Bug,Lugworm");
  await p.click('#fvBait [data-bait="2587"] img');
  await p.waitForFunction(() => document.querySelector("#baitDialog").open && document.querySelector("#bvBody h3"));
  let b = await bait();
  t.check("clicking its icon opens where to get it, over the fish view", b.open && b.name === "Pill Bug" && await p.$eval("#fishDialog", d => d.open), b);
  t.check("Sold by: NPC, zone, (X, Y) and a gil price; 6 shown, the rest folded",
    b.heads[0] === "Sold by" && b.rows.length === 6 && b.rows.every(r => /\(X \d+(\.\d)?, Y \d+(\.\d)?\)\s*\d+ gil$/.test(r)) && /^\d+ more vendors?$/.test(b.more ?? "1 more vendor"), b);
  t.check("no seasonal-event vendors", !b.rows.some(r => /Faire|Festive|Seasonal/i.test(r)));
  await p.keyboard.press("Escape");
  t.check("closing the bait view leaves the fish view open", !(await p.$eval("#baitDialog", d => d.open)) && await p.$eval("#fishDialog", d => d.open));

  // mooch fish are not bait chips
  await openFish("Wahoo", 4904);
  t.check("a mooch fish (Merlthor Goby) isn't a bait chip", await p.$$eval("#fvBait [data-bait]", b => b.every(x => x.textContent.trim() !== "Merlthor Goby")) && /Merlthor Goby/.test(await text(p, "#fvBait")));

  // craft-only bait
  await openFish("Monkfish", 4889);
  await p.click('#fvBait [data-bait="2619"]');
  await p.waitForFunction(() => document.querySelector("#bvName").textContent === "Heavy Steel Jig" && document.querySelector("#bvBody h3"));
  b = await bait();
  t.check("a craft-only bait: Crafted by <job>, Level N recipe", !b.heads.includes("Sold by") && b.heads.includes("Crafted by") && b.rows.some(r => /^(Blacksmith|Armorer|Goldsmith|Carpenter|Leatherworker|Weaver|Alchemist|Culinarian) Level \d+ recipe$/.test(r)), b);
  t.check("bait view fits a phone", await noOverflow(p));
  await t.shot(p, "bait-phone");
  await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
  t.noErrors(p);

  // Log Route: bait chips in "Bring:" and the bait lines
  const r = await t.page({ clock: T0, path: "#route" });
  await r.waitForSelector(".lr-step [data-bait]");
  t.check("Log Route: Bring and bait lines have bait chips; fish names don't", await r.$$eval(".lr-notes [data-bait]", b => b.length > 0)
    && await r.$$eval(".lr-bait [data-bait]", b => b.length > 0) && await r.$$eval(".lr-bait b + [data-bait], .lr-fname [data-bait]", b => b.length === 0));
  await r.click(".lr-notes [data-bait]");
  await r.waitForFunction(() => document.querySelector("#baitDialog").open && document.querySelector("#bvBody h3"));
  t.check("Log Route: clicking a bait opens its sources", /Sold by|Crafted by/.test(await text(r, "#bvBody")));
  t.noErrors(r, "route");
}
