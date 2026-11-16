// Edit mode: clicks only change caught while it's on; Mark all caught / uncaught with confirmation.
import { gridReady, caughtCount, text } from "../lib/app.mjs";

export default async function (t) {
  const p = await t.page();
  await gridReady(p);
  const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem("odd-caught-v2") || "[]").length);

  // Edit off: a click opens the fish view, nothing changes
  t.check("Edit is off on load; bulk buttons hidden", !(await p.$eval("#editBtn", b => b.classList.contains("on"))) && await p.$eval("#bulkBar", b => b.hidden));
  await p.click('.tile[data-id="4776"]');
  await p.waitForFunction(() => document.querySelector("#fishDialog").open);
  t.check("Edit off: click opens the fish view, caught unchanged", await caughtCount(p) === 0 && await text(p, "#fvName") === "Malm Kelp");
  await p.keyboard.press("Escape");

  // Edit on: click toggles
  await p.click("#editBtn");
  t.check("Edit on: gold button, hint, bulk buttons shown", await p.$eval("#editBtn", b => b.classList.contains("on")) && /Editing/.test(await text(p, "#hint")) && !(await p.$eval("#bulkBar", b => b.hidden)));
  await p.click('.tile[data-id="4776"]');
  t.check("Edit on: click marks caught (and saves)", await caughtCount(p) === 1 && await stored() === 1 && await p.$eval('.tile[data-id="4776"]', e => e.classList.contains("caught")));
  await p.click('.tile[data-id="4776"]');
  t.check("…and again unmarks", await caughtCount(p) === 0 && await stored() === 0);

  // Mark all caught: dialog, Cancel/Escape change nothing, confirm marks the tab's list only
  await p.click("#markAllBtn");
  t.check("Mark all: dialog says what changes, Cancel focused", await text(p, "#bulkTitle") === "Mark all fish as caught?" && /all 1,517 fish on the Fishing tab/.test(await text(p, "#bulkText"))
    && await p.evaluate(() => document.activeElement.id) === "bulkCancel");
  await p.click("#bulkCancel");
  await p.click("#markAllBtn"); await p.keyboard.press("Escape");
  t.check("Cancel / Escape change nothing", await caughtCount(p) === 0 && !(await p.$eval("#bulkDialog", d => d.open)));
  await p.click("#markAllBtn"); await p.click("#bulkGo");
  await p.waitForFunction(() => document.querySelector("#caughtCount").textContent === "1517");
  t.check("confirm marks all 1517 fish (not spearfish)", await caughtCount(p) === 1517 && await stored() === 1517);
  await p.click("#markAllBtn");
  t.check("nothing to do: says so, only Close", /already caught/.test(await text(p, "#bulkText")) && await p.$eval("#bulkGo", b => b.hidden) && await text(p, "#bulkCancel") === "Close");
  await p.click("#bulkCancel");

  await p.click("[data-mode=spear]");
  await p.waitForFunction(() => document.querySelector("#totalCount").textContent === "289");
  await p.click("#unmarkAllBtn");
  t.check("Spearfishing tab: nothing to unmark there", /No spearfish on the Spearfishing tab are marked caught/.test(await text(p, "#bulkText")));
  await p.click("#bulkCancel");
  await p.click("[data-mode=fish]");
  await p.click("#unmarkAllBtn");
  t.check("Unmark all: red confirm", await text(p, "#bulkGo") === "Unmark all" && await p.$eval("#bulkGo", b => b.classList.contains("danger")));
  await p.click("#bulkGo");
  await p.waitForFunction(() => document.querySelector("#caughtCount").textContent === "0");
  t.check("unmarks all", await caughtCount(p) === 0 && await stored() === 0);
  await p.click("#editBtn");
  t.check("Edit off again hides the bulk buttons", await p.$eval("#bulkBar", b => b.hidden));
  t.noErrors(p);
}
