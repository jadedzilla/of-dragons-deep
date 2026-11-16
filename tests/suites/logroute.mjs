// Log Route page at a fixed moment: the plan in the browser (the planner itself is covered in unit.mjs).
import { readFile } from "node:fs/promises";
import { text, noOverflow } from "../lib/app.mjs";
import { T0 } from "./unit.mjs";

const steps = p => p.$$eval(".lr-step", ss => ss.map(s => ({
  kind: ["stop", "timed", "ocean", "nowindow", "nodata"].find(k => s.classList.contains(k)), up: s.classList.contains("up"),
  when: s.querySelector(".lr-when")?.textContent ?? "", where: s.querySelector(".lr-where").textContent.replace(/\s+/g, " ").trim(),
  fish: [...s.querySelectorAll(".lr-f")].map(f => ({ id: +f.querySelector("[data-mark]").dataset.mark, bait: f.querySelector(".lr-bait").textContent.replace(/\s+/g, " ").trim() })) })));

export default async function (t) {
  const p = await t.page({ clock: T0, path: "#route" });
  await p.waitForSelector(".lr-step");
  t.check("summary: fish left, steps, hours", /^1,517 fish left \(0 \/ 1,517 caught\) · \d+ steps · land fishing ≈ \d+ h$/.test(await text(p, "#lrSummary")), await text(p, "#lrSummary"));
  let s = await steps(p);
  t.check("15 steps at a time", s.length === 15);
  t.check("step 1: 'Now', a timed fish whose window is open", s[0].when === "Now" && s[0].kind === "timed" && s[0].up, s[0]);
  const stop = s.find(x => x.kind === "stop");
  t.check("a spot stop: place + zone + count, a bait line per fish", /^Go to .+, .+ · \d+ fish$/.test(stop.where) && stop.fish.length > 1 && stop.fish.every(f => f.bait.includes("→")), stop);
  t.check("stop zones are the spot's own (Moraby Bay is in Lower La Noscea)", s.filter(x => /Moraby Bay/.test(x.where)).every(x => /Moraby Bay, Lower La Noscea/.test(x.where)));
  await t.shot(p, "desktop");

  await p.click("#lrMore");
  await p.waitForFunction(() => document.querySelectorAll(".lr-step").length === 30);
  t.check("Show more adds 15 steps", true);
  s = await steps(p);

  const victim = stop.fish[0].id;
  await p.click(`.lr-f [data-mark="${victim}"]`);
  await p.waitForFunction(id => !document.querySelector(`.lr-f [data-mark="${id}"]`), victim);
  const after = await steps(p);
  t.check("✓ marks caught and removes it without re-planning", after[0].where === s[0].where && /^1,516 fish left/.test(await text(p, "#lrSummary"))
    && await p.evaluate(id => JSON.parse(localStorage.getItem("odd-caught-v2")).includes(id), victim));
  await p.click("#lrRecalc");
  await p.waitForFunction(() => document.querySelectorAll(".lr-step").length === 15);
  t.check("Re-plan from now leaves caught fish out", /^1,516 fish left/.test(await text(p, "#lrSummary")));
  await p.click(".lr-f .ns-ficon");
  await p.waitForFunction(() => document.querySelector("#fishDialog").open);
  t.check("a fish icon opens its details", true);
  t.noErrors(p);

  // only ocean fish left: one step per voyage stop, with port, spectral-current split and time-of-day voyages
  const data = JSON.parse(await readFile(new URL("../../data/fish.json", import.meta.url), "utf8")), sea = data.tables.reg.indexOf("The High Seas");
  const land = data.rows.filter(r => r[6] !== sea).map(r => r[0]);
  const o = await t.page({ clock: T0, path: "#route", storage: { "odd-caught-v2": JSON.stringify(land) } });
  await o.waitForSelector(".lr-step");
  const os = await steps(o);
  t.check("ocean only: 259 fish left, every step a voyage stop", /^259 fish left/.test(await text(o, "#lrSummary")) && os.every(x => x.kind === "ocean")
    && /^Ocean fishing from Limsa Lominsa Lower Decks \(Indigo route\) — stop Galadion Bay · \d+ fish$/.test(os[0].where), os.map(x => x.where));
  t.check("ocean: spectral-current fish listed separately; time-of-day voyages named", await o.$$eval(".lr-sub", e => e.length) > 0
    && /need a voyage that reaches Galadion Bay then: .*(Day|Sunset|Night)/.test(await o.$eval(".lr-step .lr-notes", e => e.textContent)));
  t.noErrors(o, "ocean");

  const ph = await t.page({ width: 375, height: 900, clock: T0, path: "#route" });
  await ph.waitForSelector(".lr-step");
  t.check("phone: nav fits, no horizontal overflow", await noOverflow(ph));
  await t.shot(ph, "phone");
}
