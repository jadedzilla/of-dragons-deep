// Fish Import: add / replace (with confirm), skipped ids, ?import= links (plain and the plugin's compressed format),
// and an achievements export pasted in the wrong place.
import { deflateRawSync } from "node:zlib";
import { gridReady, caughtCount, text } from "../lib/app.mjs";

/** The plugin's link payload: sorted id deltas as LEB128 varints, raw deflate, base64url without padding. */
function pluginLink(ids) {
  const out = []; let prev = 0;
  for (const id of [...ids].sort((a, b) => a - b)) { let d = id - prev; prev = id; do { let b = d & 0x7f; d = Math.floor(d / 128); if (d) b |= 0x80; out.push(b); } while (d); }
  return "1." + deflateRawSync(Buffer.from(out)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default async function (t) {
  const p = await t.page();
  await gridReady(p);
  const run = async (ids, mode = "add") => {
    if (!(await p.$eval("#importDialog", d => d.open))) await p.click("#importBtn");
    await p.fill("#importText", ids);
    await p.check(`input[name=importMode][value=${mode}]`);
    await p.click("#importGo");
  };

  await run("4776, 4869 4870;20144\nabc, 99999");
  await p.waitForFunction(() => !document.querySelector("#importDialog").open);
  t.check("add: fish + spearfish ids, any separators; dialog closes", await caughtCount(p) === 3);
  t.check("notice reports skipped ids", /Marked 4 new fish/.test(await text(p, "#toast")) && /99999/.test(await text(p, "#toast")) && /abc/.test(await text(p, "#toast")), await text(p, "#toast"));

  await run("4776", "replace");
  t.check("replace that would unmark asks first", await text(p, "#importGo") === "Unmark 3 & import" && /unmark 3/i.test(await text(p, "#importResult")) && await caughtCount(p) === 3);
  await p.click("#importGo");
  await p.waitForFunction(() => !document.querySelector("#importDialog").open);
  t.check("second click replaces", await caughtCount(p) === 1);

  await run("99999, abc");
  t.check("nothing valid: warning, dialog stays open", /None of these are fish/.test(await text(p, "#importResult")) && await p.$eval("#importDialog", d => d.open));
  await run('{"source":"OfDragonsDeep","achievements":[{"id":259,"complete":true}]}');
  t.check("an achievements export points to the Achievements page", /achievements export/.test(await text(p, "#importResult")) && await caughtCount(p) === 1);
  await p.click("#toAchImport");
  await p.waitForFunction(() => location.hash === "#achievements" && !document.querySelector("#importDialog").open);
  t.check("…and its link opens Achievements", true);
  t.noErrors(p);

  // ?import= links open the dialog prefilled; nothing changes until Import
  for (const [name, param, n] of [["plain list", "4776,4869,4870", 3], ["plugin format", pluginLink([4776, 4869, 4870, 4925, 99999]), 4]]) {
    const q = await t.page({ path: `?import=${encodeURIComponent(param)}#x` });
    await gridReady(q);
    await q.waitForFunction(() => document.querySelector("#importDialog").open);
    t.check(`link (${name}): prefilled, nothing imported yet, ?import removed`, (await text(q, "#importResult")).includes(`Loaded ${n} fish`) && await caughtCount(q) === 0
      && await q.evaluate(() => location.search + location.hash) === "#x");
    await q.click("#importGo");
    await q.waitForFunction(() => !document.querySelector("#importDialog").open);
    t.check(`link (${name}): Import marks them`, await caughtCount(q) === n);
    t.noErrors(q, name);
  }
  const bad = await t.page({ path: "?import=1.%21%21bad" });
  await gridReady(bad);
  await bad.waitForFunction(() => document.querySelector("#importDialog").open);
  t.check("broken link: warning, nothing changed", /couldn't be read/.test(await text(bad, "#importResult")) && await caughtCount(bad) === 0);
}
