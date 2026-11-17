// The one Import dialog (Fish Guide and Achievements pages): the plugin's version 2 export of caught fish +
// Fisher achievements, Replace (default, confirms before unmarking) and Add, error messages, and ?import=2. links.
import { gridReady, goTo, caughtCount, text, pluginExport, pluginLink } from "../lib/app.mjs";

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
    await p.click("#importGo");
    await p.waitForFunction(() => !document.querySelector("#importDialog").open || document.querySelector("#importResult").textContent.trim());
    return (await p.$eval("#importDialog", d => d.open)) ? text(p, "#importResult") : text(p, "#toast");
  };

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
  let s = await saved();
  t.check("…saved: 3 fish caught here, achievement mark + progress", await caughtCount(p) === 3 && s.marks.includes(ON_A_BOAT_I) && JSON.stringify(s.progress[ON_A_BOAT_II]) === "[42000,100000]", s);

  // Replace that would unmark asks first, naming both kinds
  msg = await run(pluginExport([4776], [ach(ON_A_BOAT_I, false)]), "replace");
  t.check("Replace that unmarks fish + achievements asks first", await text(p, "#importGo") === "Unmark 3 fish + 1 achievement & import" && /unmark 3 fish and 1 achievement/.test(msg)
    && await caughtCount(p) === 3, msg);
  await p.click("#importGo");
  await p.waitForFunction(() => !document.querySelector("#importDialog").open);
  s = await saved();
  t.check("second click replaces", await caughtCount(p) === 1 && !s.marks.includes(ON_A_BOAT_I) && /Unmarked 1 achievement/.test(await text(p, "#toast")), s);

  // Add keeps what's there
  msg = await run(pluginExport([4869]), "add");
  t.check("Add keeps existing fish; an export without achievements leaves them alone", await caughtCount(p) === 2 && !/achievement/.test(msg), msg);

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
