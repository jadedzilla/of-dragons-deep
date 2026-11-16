// Achievements page: sections, progress from caught fish, grouped meta achievements, manual marks, collapsing,
// and importing the Of Dragons Deep plugin's achievement export.
import { NET } from "../lib/network.mjs";
import { gridReady, goTo, importFish, text, noOverflow } from "../lib/app.mjs";

const ACH = Object.entries(NET.exact).find(([k]) => k.includes("sheets=Achievement"))[1].results
  .map(r => ({ id: r.row_id, name: r.fields.Name, points: r.fields.Points }));
const idOf = name => ACH.find(a => a.name === name).id;
const GALADION = [28937, 28938, 29723, 29719, 28942, 28939, 29734, 29721, 29784, 29744]; // Outer Galadion Bay, no spectral current
const ALL_OPEN = { "odd-achievements-open": '["log","big","ocean","milestones","other"]' };

const row = (p, name) => p.evaluate(n => {
  const r = [...document.querySelectorAll(".ac-row")].find(r => r.querySelector(".ac-name").firstChild.textContent.trim() === n);
  if (!r) return null;
  const parentRow = r.closest(".ac-children")?.closest(".ac-group")?.querySelector(":scope > .ac-row");
  return { done: r.classList.contains("done"), progress: r.querySelector(".ac-progress span")?.textContent.replace(/\s+/g, " ").trim() ?? null,
    fish: r.querySelectorAll(".ac-f").length, caughtFish: r.querySelectorAll(".ac-f.caught").length, mark: r.querySelector("[data-mark]")?.checked ?? null,
    parent: parentRow?.querySelector(".ac-name").firstChild.textContent.trim() ?? null, section: r.closest(".ac-section").querySelector("h3").firstChild.textContent.trim() };
}, name);
const mark = (p, name) => p.evaluate(n => [...document.querySelectorAll(".ac-row")].find(r => r.querySelector(".ac-name").firstChild.textContent.trim() === n).querySelector("[data-mark]").click(), name);

export default async function (t) {
  // ---------- progress, sections, groups ----------
  const p = await t.page({ storage: ALL_OPEN });
  await gridReady(p);
  t.check("the guide alone loads no achievements", !(await p.evaluate(() => performance.getEntriesByType("resource").some(e => /sheets=Achievement/.test(e.name)))));
  await importFish(p, GALADION);
  await goTo(p, "achievements");
  await p.waitForSelector(".ac-row");
  t.check("all 133 listed once", await p.$$eval(".ac-row", rs => rs.length === 133 && new Set(rs.map(r => r.dataset.id)).size === 133));
  t.check("sections", JSON.stringify(await p.$$eval(".ac-section h3", hs => hs.map(h => h.firstChild.textContent.trim()))) === '["Fish log","Big fish","Ocean Fishing","Fishing milestones","Other"]');
  let a = await row(p, "I Caught That I");
  t.check("I Caught That I: 10 / 40 from caught fish", a.progress === "10 / 40" && !a.done && a.section === "Fish log", a);
  a = await row(p, "I Caught That IX");
  t.check("big numbers get separators (10 / 1,730)", a.progress === "10 / 1,730", a);
  a = await row(p, "Denizens of Galadion");
  t.check("Denizens of Galadion done: 10 / 10, all 10 fish icons caught", a.done && a.progress === "10 / 10" && a.fish === 10 && a.caughtFish === 10, a);
  t.check("Specters of Galadion 0 / 10", (await row(p, "Specters of Galadion")).progress === "0 / 10");
  a = await row(p, "On a Boat I");
  t.check("voyage achievements are in Ocean Fishing (53 there), marked by hand", a.section === "Ocean Fishing" && a.mark === false && /\/ 53$/.test(await text(p, '.ac-section[data-section=ocean] summary')), a);

  const tree = await p.evaluate(() => {
    const walk = g => ({ name: g.querySelector(":scope > .ac-row .ac-name").firstChild.textContent.trim(),
      parts: [...(g.querySelector(":scope > .ac-children")?.children ?? [])].map(c => c.classList.contains("ac-group") ? walk(c) : c.querySelector(".ac-name").firstChild.textContent.trim()) });
    return [...document.querySelectorAll(".ac-section > .ac-group")].map(walk);
  });
  const ge = tree.find(x => x.name === "A Fisher's Life for Me: Greater Eorzea"), big = tree.find(x => x.name === "I Came, I Saw, I Fished");
  t.check("groups: Greater Eorzea → 3 regions → 5 each", tree.length === 2 && ge?.parts.length === 3 && ge.parts.every(x => x.parts?.length === 5), ge);
  t.check("groups: big fish chain nested 3 deep", JSON.stringify(big) === JSON.stringify({ name: "I Came, I Saw, I Fished", parts: [{ name: "Fish Fear Me", parts: [
    { name: "No River Wide Enough", parts: ["Go Big or Go Home XVI", "Go Big Far from Home V"] }, "Go Big Till the End III"] }, "Go Big on the Trail III"] }), big);

  for (const n of ["I", "II", "III", "IV"]) await mark(p, `Good Things Come to Those Who Bait: La Noscea ${n}`);
  a = await row(p, "A Fisher's Life for Me: La Noscea");
  t.check("meta: 4 / 5 achievements, not done", !a.done && a.progress === "4 / 5 achievements", a);
  await mark(p, "Good Things Come to Those Who Bait: La Noscea V");
  t.check("meta done once all 5 are marked", (await row(p, "A Fisher's Life for Me: La Noscea")).done);
  t.check("summary: 7 obtained, 45 points", /^7 of 133 obtained · 45 of \d+ points$/.test(await text(p, "#acSummary")), await text(p, "#acSummary"));
  await p.check("#acHideDone");
  t.check("Hide obtained", !(await row(p, "Denizens of Galadion")) && !!(await row(p, "Specters of Galadion")));
  await p.uncheck("#acHideDone");
  await p.evaluate(() => document.querySelector(".ac-f").click());
  await p.waitForFunction(() => document.querySelector("#fishDialog").open);
  t.check("a fish icon opens its details", true);
  await p.keyboard.press("Escape");
  await p.reload(); await p.waitForSelector(".ac-row");
  t.check("marks persist after reload", (await row(p, "Good Things Come to Those Who Bait: La Noscea V")).mark === true);
  t.noErrors(p);

  // ---------- collapsing ----------
  const c = await t.page({ width: 375, height: 900, path: "#achievements" });
  await c.waitForSelector(".ac-row", { state: "attached" });
  const sections = () => c.evaluate(() => Object.fromEntries([...document.querySelectorAll(".ac-section")].map(d => [d.dataset.section, d.open])));
  t.check("sections start collapsed, counts still visible", Object.values(await sections()).every(o => !o) && /0 \/ 9/.test(await text(c, ".ac-section[data-section=log] summary")));
  await c.click(".ac-section[data-section=log] > summary");
  await c.waitForFunction(() => (localStorage.getItem("odd-achievements-open") || "").includes("log")); // saved on the async toggle event
  await c.reload(); await c.waitForSelector(".ac-row", { state: "attached" });
  const s = await sections();
  t.check("an expanded section is remembered", s.log && !s.big, s);
  t.check("phone: no horizontal overflow", await noOverflow(c));
  await t.shot(c, "phone");

  // ---------- plugin import ----------
  const DONE = ["Good Things Come to Those Who Bait: La Noscea I", "Go Big or Go Home I", "On a Boat I", "I Caught That I"];
  const PROGRESS = { "Good Things Come to Those Who Bait: La Noscea II": [31, 100], "On a Boat II": [42000, 100000] };
  const exportJson = (done = DONE) => JSON.stringify({ source: "OfDragonsDeep", version: 1, category: "Fisher",
    achievements: ACH.map(x => ({ id: x.id, name: x.name, points: x.points, complete: done.includes(x.name), current: PROGRESS[x.name]?.[0] ?? null, max: PROGRESS[x.name]?.[1] ?? null })) });
  const i = await t.page({ storage: ALL_OPEN, path: "#achievements" });
  await i.waitForSelector(".ac-row");
  const imp = async txt => {
    if (!(await i.$eval("#acImportDialog", d => d.open))) await i.click("#acImportBtn");
    await i.fill("#acImportText", txt); await i.click("#acImportGo");
    await i.waitForFunction(() => document.querySelector("#acImportResult").textContent.trim());
    return text(i, "#acImportResult");
  };
  let msg = await imp(exportJson());
  t.check("JSON: 4 completed + progress for 2", msg === "Imported 4 completed achievements. Imported progress for 2 unfinished achievements.", msg);
  await i.click("#acImportClose");
  a = await row(i, "Go Big or Go Home I");
  t.check("game-reported completion counts for fish-based achievements", a.done && a.progress === "0 / 1", a);
  t.check("imported progress bars", (await row(i, "Good Things Come to Those Who Bait: La Noscea II")).progress === "31 / 100 in game"
    && (await row(i, "On a Boat II")).progress === "42,000 / 100,000 in game");
  t.check("'Last imported' note", /^Last imported from the plugin /.test(await text(i, "#acImported")));
  msg = await imp(exportJson(DONE.filter(n => n !== "On a Boat I")));
  t.check("re-import that unmarks asks first", /says 1 achievement you've marked obtained isn't complete: On a Boat I/.test(msg) && await text(i, "#acImportGo") === "Unmark 1 & import" && (await row(i, "On a Boat I")).done, msg);
  await i.click("#acImportGo");
  await i.waitForFunction(() => /Unmarked/.test(document.querySelector("#acImportResult").textContent));
  t.check("second click unmarks", !(await row(i, "On a Boat I")).done);
  msg = await imp(`${idOf("Mine, Mine, Mine")}, 99999`);
  t.check("ID list only adds; unknown ids listed", /^Imported 1 completed achievement\./.test(msg) && /list of IDs/.test(msg) && /Skipped 1 not in this list: 99999/.test(msg), msg);
  msg = await imp(`id,name,points,complete,current,max\n${idOf("Baiting Heavensward")},"Baiting Heavensward",10,false,1234,3000`);
  t.check("CSV with progress", msg === "Imported progress for 1 unfinished achievement." && (await row(i, "Baiting Heavensward")).progress === "1,234 / 3,000 in game", msg);
  msg = await imp("[x] Baiting Heavensward\n[ ] Not An Achievement");
  t.check("checklist matched by name", /^Imported 1 completed achievement\./.test(msg) && /Not An Achievement/.test(msg), msg);
  msg = await imp('{"source":"OfDragonsDeep","fish":[{"id":4776}]}');
  t.check("a fish export is pointed to the Fish Guide", /fish export/.test(msg), msg);
  await i.click("#acImportClose");
  await i.reload(); await i.waitForSelector(".ac-row");
  t.check("imports persist after reload", (await row(i, "Mine, Mine, Mine")).done && (await row(i, "Good Things Come to Those Who Bait: La Noscea II")).progress === "31 / 100 in game");
  t.noErrors(i, "import");

  // ---------- failed load ----------
  const f = await t.page({ path: null });
  await f.route(/sheets=Achievement/, r => r.abort());
  await f.goto(t.url + "#achievements");
  await f.waitForSelector("#acRetry");
  await f.unroute(/sheets=Achievement/);
  await f.click("#acRetry");
  await f.waitForSelector(".ac-row", { state: "attached" });
  t.check("failed load → Try again works", (await f.$$(".ac-row")).length === 133);
}
