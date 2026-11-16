// Fish detail view (click a fish with Edit off): facts, description/canvas, aquarium, best bait, hookset and tug.
import { gridReady, search, text, noOverflow } from "../lib/app.mjs";

export default async function (t) {
  const p = await t.page({ width: 375, height: 900 }); // phone width: the view must fit
  await gridReady(p);
  const open = async (name, id) => {
    if (await p.$eval("#fishDialog", d => d.open)) await p.keyboard.press("Escape");
    await search(p, name);
    await p.click(`.tile[data-id="${id}"]`);
    await p.waitForFunction(() => document.querySelector("#fishDialog").open && !/…/.test(document.querySelector("#fvFacts").textContent)
      && !document.querySelector("#fvDesc .loading:not(:empty)")?.textContent.startsWith("Loading"));
    return p.evaluate(() => ({
      tags: [...document.querySelectorAll("#fvTags span")].map(s => s.textContent),
      facts: Object.fromEntries([...document.querySelectorAll("#fvFacts dt")].map(dt => [dt.textContent, dt.nextElementSibling.textContent.replace(/\s+/g, " ").trim()])),
      baitLines: [...document.querySelectorAll("#fvBait .fv-bait-line")].map(l => l.textContent.replace(/\s+/g, " ").trim()),
      baitIcons: document.querySelectorAll("#fvBait img").length,
      desc: document.querySelector("#fvDesc").textContent.replace(/\s+/g, " ").trim(),
    }));
  };

  let v = await open("Malm Kelp", 4776);
  t.check("Malm Kelp: location, water, level, expansion, status, id",
    v.facts.Location === "Limsa Lominsa Upper Decks, La Noscea" && v.facts.Water === "Coastlines" && v.facts.Level === "4" && v.facts.Expansion === "A Realm Reborn"
    && v.facts.Status === "Not yet caught" && v.facts["Item ID"] === "4776", v.facts);
  t.check("description shown; its canvas note becomes the Canvas line", /^This dark green variety of seaweed/.test(v.desc) && !/canvases/.test(v.desc) && v.facts.Canvas === "Small", v);
  t.check("best bait differs by spot: one line per bait with its spots",
    JSON.stringify(v.baitLines) === JSON.stringify(["Pill Bug at Limsa Lominsa Lower Decks, Moraby Bay", "Lugworm at Limsa Lominsa Upper Decks"]) && v.baitIcons === 2, v.baitLines);
  t.check("hookset + tug", v.facts.Hookset === "Precision" && v.facts.Tug === "Light (!)", v.facts);
  t.check("view fits a phone", await noOverflow(p));
  await t.shot(p, "malm-kelp");

  v = await open("Wahoo", 4904);
  t.check("Wahoo: mooch chains, most common bait last as 'other spots'",
    v.baitLines.length === 2 && /^Pill Bug → Merlthor Goby \(mooch\) at /.test(v.baitLines[0]) && v.baitLines[1] === "Lugworm → Merlthor Goby (mooch) at other spots", v.baitLines);
  t.check("Wahoo: Powerful, Medium (!!)", v.facts.Hookset === "Powerful" && v.facts.Tug === "Medium (!!)");

  v = await open("Galadion Goby", 28937);
  t.check("ocean fish: Category instead of Expansion, no Level", v.facts.Category === "Ocean Fishing" && !("Level" in v.facts) && !("Expansion" in v.facts), v.facts);
  t.check("ocean fish: alternatives joined with 'or', per stop",
    JSON.stringify(v.baitLines) === JSON.stringify(["Plump Worm or Versatile Lure or Krill at Outer Galadion Bay", "Ragworm at The Northern Strait of Merlthor"]), v.baitLines);

  v = await open("Merlthor Goby", 4869);
  t.check("Aquarium line", /tier \d tanks and up|Not suitable/.test(v.facts.Aquarium), v.facts.Aquarium);

  // a fish whose description isn't recorded → XIVAPI 404 → graceful message
  v = await open("Ocean Cloud", 4872);
  t.check("description unavailable: message, canvas unavailable", /Description unavailable right now/.test(v.desc) && v.facts.Canvas === "Unavailable right now", v);

  // spearfish: Size instead of Water, no bait/hookset/tug
  await p.keyboard.press("Escape");
  await p.click("[data-mode=spear]");
  await p.waitForFunction(() => document.querySelector("#totalCount").textContent === "289");
  v = await open("Wentletrap", 20144);
  t.check("spearfish: Size, Spearfishing tag, no bait/hookset/tug", v.facts.Size === "Small" && v.tags.includes("Spearfishing") && !("Best bait" in v.facts) && !("Hookset" in v.facts) && !("Tug" in v.facts), v);
  await p.keyboard.press("Escape");
  t.check("Escape closes the view", !(await p.$eval("#fishDialog", d => d.open)));
  t.noErrors(p);
}
