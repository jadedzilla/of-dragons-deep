// The one Import dialog (Fish Guide and Achievements pages): the plugin's version 2 export of caught fish +
// Fisher achievements, Replace (default, confirms before unmarking) and Add, error messages, and ?import=2. links.
import { gridReady, goTo, caughtCount, text, pluginExport, pluginLink, closeGacha } from "../lib/app.mjs";

const ON_A_BOAT_I = 2557, ON_A_BOAT_II = 2558, GO_BIG_I = 916; // Fisher achievement ids
const ach = (id, complete, current, max) => ({ id, complete, ...(max ? { current, max } : {}) });

export default async function (t) {
  const p = await t.page();
  await gridReady(p);
  const saved = () => p.evaluate(() => ({ marks: JSON.parse(localStorage.getItem("odd-achievements-v1") || "[]"),
    progress: JSON.parse(localStorage.getItem("odd-achievements-progress-v1") || "null")?.items ?? {} }));
  /** Paste into the dialog, pick a mode, press Import; returns the dialog's message, or the notice if it closed. */
  const run = async (body, mode) => {
    if (!(await p.$eval("#importDialog", d => d.open))) await p.click("#importBtn");
    await p.fill("#importText", body);
    if (mode) await p.check(`input[name=importMode][value=${mode}]`);
    await clearToast();
    await p.click("#importGo");
    await p.waitForFunction(() => !document.querySelector("#importDialog").open || document.querySelector("#importResult").textContent.trim());
    if (await p.$eval("#importDialog", d => d.open)) return text(p, "#importResult");
    reveal = await gachaState(p);
    await closeGacha(p);
    await p.waitForSelector("#toast.show");
    return text(p, "#toast");
  };
  const clearToast = () => p.evaluate(() => { const n = document.querySelector("#toast"); n.classList.remove("show"); n.textContent = ""; });
  /** The new-fish reveal after an import (null if none): its cards (fish ids), "+N more" strip. */
  const gachaState = pg => pg.evaluate(() => { const d = document.querySelector("#gachaDialog"); return d.open ? {
    cards: [...d.querySelectorAll(".gc-card")].map(c => +c.dataset.id), mini: d.querySelectorAll(".gc-mini").length,
    more: d.querySelector(".gc-more")?.textContent ?? "" } : null; });
  let reveal;

  // dialog
  await p.click("#importBtn");
  t.check("dialog: covers fish + achievements, Replace is the default", /caught fish.*fishing achievements/.test(await text(p, "#importDialog .hint"))
    && await p.isChecked("input[name=importMode][value=replace]"));

  // errors: nothing changes, dialog stays open
  const errors = [
    ["empty", "", /Paste the plugin's Copy JSON export first/],
    ["a plain id list", "4776, 4869", /isn't an export from the Of Dragons Deep plugin/],
    ["someone else's JSON", '{"fish":[4776]}', /isn't an export from the Of Dragons Deep plugin/],
    ["an older plugin export", JSON.stringify({ source: "OfDragonsDeep", version: 1, fish: [{ id: 4776 }] }), /older version of the Of Dragons Deep plugin/],
    ["cut-off JSON", pluginExport([4776]).slice(0, 30), /couldn't be read/],
    ["no known fish or achievements", pluginExport([99999]), /no caught fish or achievements/],
  ];
  for (const [name, body, re] of errors) {
    const msg = await run(body);
    t.check(`rejects ${name}`, re.test(msg) && await p.$eval("#importDialog", d => d.open) && await caughtCount(p) === 0, msg);
  }

  // Replace into an empty log: fish (and spearfish) + achievements, unknown / invalid ids reported
  let msg = await run(pluginExport([4776, 4869, 4870, 20144, 99999, "x"], [ach(ON_A_BOAT_I, true), ach(ON_A_BOAT_II, false, 42000, 100000), ach(GO_BIG_I, false)]));
  t.check("import: dialog closes, notice summarises fish + achievements", /^Marked 4 new fish as caught\. 1 achievement complete \(1 new\), progress for 1 more \(see Achievements\)\./.test(msg)
    && /Skipped 1 ID that isn't a fish: 99999/.test(msg) && /Skipped 1 entry that isn't an item ID: x/.test(msg), msg);
  t.check("reveal: the new fish (incl. the spearfish), one card each", JSON.stringify(reveal?.cards.sort()) === "[20144,4776,4869,4870]" && !reveal.more, reveal);
  let s = await saved();
  t.check("…saved: 3 fish caught here, achievement mark + progress", await caughtCount(p) === 3 && s.marks.includes(ON_A_BOAT_I) && JSON.stringify(s.progress[ON_A_BOAT_II]) === "[42000,100000]", s);

  // Replace that would unmark asks first, naming both kinds
  msg = await run(pluginExport([4776], [ach(ON_A_BOAT_I, false)]), "replace");
  t.check("Replace that unmarks fish + achievements asks first", await text(p, "#importGo") === "Unmark 3 fish + 1 achievement & import" && /unmark 3 fish and 1 achievement/.test(msg)
    && await caughtCount(p) === 3, msg);
  await clearToast();
  await p.click("#importGo");
  await p.waitForSelector("#toast.show"); // nothing new caught: straight to the notice, no reveal
  t.check("nothing new caught: no reveal", !(await p.$eval("#gachaDialog", d => d.open)));
  s = await saved();
  t.check("second click replaces", await caughtCount(p) === 1 && !s.marks.includes(ON_A_BOAT_I) && /Unmarked 1 achievement/.test(await text(p, "#toast")), s);

  // Add keeps what's there
  msg = await run(pluginExport([4869]), "add");
  t.check("Add keeps existing fish; an export without achievements leaves them alone", await caughtCount(p) === 2 && !/achievement/.test(msg), msg);

  // a big import: the animation plays (orb → cards flip), a tap skips to the end, Close closes; then the notice
  const many = await p.evaluate(() => [...document.querySelectorAll(".tile[data-id]")].map(t => +t.dataset.id).slice(0, 40));
  const fresh = many.filter(id => ![4776, 4869].includes(id)).length;
  await p.click("#importBtn");
  await p.check("input[name=importMode][value=add]");
  await p.fill("#importText", pluginExport(many));
  await clearToast();
  await p.click("#importGo");
  await p.waitForFunction(() => document.querySelector("#gachaDialog").open);
  t.check("reveal starts with the orb: nothing flipped yet, notice held back", await p.evaluate(() => !document.querySelector("#gachaDialog.done")
    && !document.querySelector(".gc-card.flipped") && !document.querySelector("#toast.show")));
  await p.waitForSelector(".gc-card.flipped"); // cards turn over one by one
  await p.click("#gachaDialog .gc-title"); // tap: skip to the end
  reveal = await gachaState(p);
  t.check("tap skips to the end: 10 cards face up, the rest as a strip, full count", await p.evaluate(() => document.querySelector("#gachaDialog").classList.contains("done")
    && document.querySelectorAll(".gc-card.flipped").length === 10) && reveal.cards.length === 10 && reveal.mini === fresh - 10
    && reveal.more === "" &&await text(p, "#gcCount") === String(fresh), reveal);
  await t.shot(p, "gacha");
  await p.click("#gcClose");
  await p.waitForSelector("#toast.show");
  t.check("Close ends it and shows the notice", !(await p.$eval("#gachaDialog", d => d.open)) && new RegExp(`^Marked ${fresh} new fish`).test(await text(p, "#toast")), await text(p, "#toast"));

  // the Achievements page's Import opens the same dialog
  await goTo(p, "achievements");
  await p.waitForSelector(".ac-row", { state: "attached" });
  await p.click("#acImportBtn");
  t.check("Achievements page Import opens the same dialog", await p.$eval("#importDialog", d => d.open));
  msg = await run(pluginExport([], [ach(GO_BIG_I, true)]), "add");
  t.check("…and importing there updates the page", /1 achievement complete/.test(msg) && await p.evaluate(id => document.querySelector(`.ac-row[data-id="${id}"]`).classList.contains("done"), GO_BIG_I)
    && /^Last imported from the plugin /.test(await text(p, "#acImported")));
  t.noErrors(p);

  // ?import=2. links open the dialog filled in; nothing changes until Import
  const link = await pluginLink([4776, 4869, 4870, 99999], [ach(ON_A_BOAT_I, true), ach(ON_A_BOAT_II, false, 31, 100), ach(GO_BIG_I, false)]);
  const q = await t.page({ path: `?import=${link}#x` });
  await gridReady(q);
  await q.waitForFunction(() => document.querySelector("#importDialog").open && document.querySelector("#importResult").textContent.trim());
  t.check("link: dialog filled in, nothing imported yet, ?import removed", /Loaded 3 fish and 1 completed achievements from your link/.test(await text(q, "#importResult"))
    && await caughtCount(q) === 0 && await q.evaluate(() => location.search + location.hash) === "#x" && await q.isChecked("input[name=importMode][value=replace]"));
  const decoded = JSON.parse(await q.inputValue("#importText"));
  t.check("link decodes to the same export (fish, achievements by id, progress)", JSON.stringify(decoded) === pluginExport([4776, 4869, 4870, 99999],
    [ach(GO_BIG_I, false), ach(ON_A_BOAT_I, true), ach(ON_A_BOAT_II, false, 31, 100)]), decoded);
  await q.click("#importGo");
  await q.waitForFunction(() => !document.querySelector("#importDialog").open);
  t.check("link: Import applies it", await caughtCount(q) === 3);
  t.noErrors(q, "link");

  for (const [name, param, re] of [["old plugin link", "1.abc", /older version/], ["plain id list link", "4776,4869", /older version/], ["broken link", "2.%21%21bad", /couldn't be read/]]) {
    const b = await t.page({ path: `?import=${param}` });
    await gridReady(b);
    await b.waitForFunction(() => document.querySelector("#importResult").textContent.trim());
    t.check(`${name}: message, nothing changed`, re.test(await text(b, "#importResult")) && await caughtCount(b) === 0, await text(b, "#importResult"));
  }
}
