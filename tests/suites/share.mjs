// Share page: the progress card image (1200×675), its numbers, and download.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gridReady, goTo, importFish, text, noOverflow } from "../lib/app.mjs";

export default async function (t) {
  const p = await t.page();
  await gridReady(p);
  // some progress: 3 fish + 2 spearfish, a finished ocean set, a few achievements and in-game progress
  const galadion = [28937, 28938, 29723, 29719, 28942, 28939, 29734, 29721, 29784, 29744];
  await importFish(p, [4776, 4869, 4870, 20144, 20145, ...galadion], [
    { id: 2557, complete: true }, { id: 259, complete: true }, { id: 2558, complete: false, current: 42000, max: 100000 }]);
  await goTo(p, "share");
  await p.waitForSelector("#shImg");
  await p.waitForFunction(() => document.querySelector("#shImg").complete && document.querySelector("#shImg").naturalWidth > 0);
  const img = () => p.$eval("#shImg", i => ({ w: i.naturalWidth, h: i.naturalHeight, alt: i.alt }));
  let im = await img();
  t.check("Share page draws a wide card (1200×675)", im.w === 1200 && im.h === 675, im);
  t.check("card numbers (alt text): fish, spearfish, big fish, achievements incl. the finished ocean set",
    /^Of Dragons Deep: 13 \/ 1,517 Fish Guide fish, 2 \/ 289 spearfish, 0 \/ \d+ big fish, 3 \/ 133 achievements \(\d+ points\)$/.test(im.alt), im.alt);
  const save = async name => { if (process.env.SHOTS) await writeFile(join(process.env.SHOTS, `share-${name}.png`),
    Buffer.from(await p.evaluate(async () => { const b = await (await fetch(document.querySelector("#shImg").src)).blob(); return [...new Uint8Array(await b.arrayBuffer())]; }))); };
  await save("wide");

  // a name redraws the card; only the one (wide) shape is offered
  const before = await p.$eval("#shImg", i => i.src);
  await p.fill("#shName", "Aya Fisher");
  await p.waitForFunction(src => document.querySelector("#shImg")?.src !== src && document.querySelector("#shImg").naturalWidth > 0, before);
  im = await img();
  t.check("a name redraws the card, still 1200×675; no shape option", im.w === 1200 && im.h === 675 && !(await p.$("input[name=shLayout]")), im);
  await save("named");
  const dl = p.waitForEvent("download");
  await p.click("#shDownload");
  const file = await dl;
  t.check("Download PNG saves of-dragons-deep-<date>.png", /^of-dragons-deep-\d{4}-\d{2}-\d{2}\.png$/.test(file.suggestedFilename()), file.suggestedFilename());
  await p.reload(); await p.waitForSelector("#shImg");
  t.check("name remembered", await p.inputValue("#shName") === "Aya Fisher");
  t.check("the card records when achievements were first seen obtained", await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("odd-achievements-seen-v1"))).length === 3));
  t.noErrors(p);

  // phone: page fits; achievements offline → card still draws (fish only)
  const ph = await t.page({ width: 320, height: 800, path: null });
  await ph.route(/sheets=Achievement/, r => r.abort());
  await ph.goto(t.url + "#share");
  await ph.waitForFunction(() => document.querySelector("#shImg")?.naturalWidth > 0);
  t.check("achievements unavailable: the card still draws, fish only", !/achievements/.test(await ph.$eval("#shImg", i => i.alt)));
  t.check("phone: nav (5 links) and page fit", await noOverflow(ph) && await ph.$$eval("#topnav a", as => as.length) === 5);
  await t.shot(ph, "phone");
}
