// Log Route page at a fixed moment: the plan in the browser (the planner itself is covered in unit.mjs).
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { text, noOverflow, T0 } from "../lib/app.mjs";
import { NET } from "../lib/network.mjs";

const steps = p => p.$$eval(".lr-step", ss => ss.map(s => ({
  kind: ["stop", "timed", "ocean", "nowindow", "nodata"].find(k => s.classList.contains(k)), up: s.classList.contains("up"),
  when: s.querySelector(".lr-when")?.textContent ?? "", where: s.querySelector(".lr-where").textContent.replace(/\s+/g, " ").trim(),
  fish: [...s.querySelectorAll(".lr-f")].map(f => ({ id: +f.querySelector("[data-mark]").dataset.mark, bait: f.querySelector(".lr-bait").textContent.replace(/\s+/g, " ").trim() })) })));

export default async function (t) {
  // default: timed fish left out
  const d = await t.page({ clock: T0, path: "#route" });
  await d.waitForSelector(".lr-step");
  const ds = await steps(d);
  t.check("without timed fish: step 1 says Next, no times anywhere", ds[0].when === "Next" && ds.slice(1).every(x => x.when === ""), ds.map(x => x.when));
  t.check("Include timed fish is off by default: no timed steps, a note says how many were left out", !(await d.isChecked("#lrTimed"))
    && ds.every(x => x.kind !== "timed") && /^\d{3} timed fish not in the route — tick Include timed fish to add them\.$/.test(await text(d, ".lr-leftout")), await text(d, "#lrSummary"));
  await d.check("#lrTimed");
  await d.waitForFunction(() => document.querySelector(".lr-step")?.classList.contains("timed"));
  t.check("ticking it adds timed fish (route re-planned) and drops the note", !(await d.$(".lr-leftout")));
  await d.reload(); await d.waitForSelector(".lr-step");
  t.check("the choice is remembered", await d.isChecked("#lrTimed") && (await steps(d))[0].kind === "timed");
  t.noErrors(d, "default");

  const p = await t.page({ clock: T0, path: "#route", storage: { "odd-route-timed": "1" } });
  await p.waitForSelector(".lr-step");
  t.check("summary: fish left, steps, hours", /^1,517 fish left \(0 \/ 1,517 caught\) · \d+ steps · land fishing ≈ \d+ h$/.test(await text(p, "#lrSummary")), await text(p, "#lrSummary"));
  let s = await steps(p);
  t.check("15 steps at a time", s.length === 15);
  t.check("step 1: 'Next', a timed fish whose window is open", s[0].when === "Next" && s[0].kind === "timed" && s[0].up, s[0]);
  t.check("only step 1 says Next; spot stops show no time; later timed steps show ≈ local time", s.slice(1).every(x => x.when !== "Next")
    && s.filter(x => x.kind === "stop").every(x => x.when === "" || x === s[0]) && s.slice(1).filter(x => x.kind === "timed").every(x => /^≈ /.test(x.when)), s.map(x => [x.kind, x.when]));
  const stop = s.find(x => x.kind === "stop");
  t.check("a spot stop: place + zone + count, a bait line per fish", /^Go to .+, .+ · \d+ fish$/.test(stop.where) && stop.fish.length > 1 && stop.fish.every(f => f.bait.includes("→")), stop);
  t.check("stop zones are the spot's own (Moraby Bay is in Lower La Noscea)", s.filter(x => /Moraby Bay/.test(x.where)).every(x => /Moraby Bay, Lower La Noscea/.test(x.where)));
  await t.shot(p, "desktop");

  await p.click("#lrMore");
  await p.waitForFunction(() => document.querySelectorAll(".lr-step").length === 30);
  t.check("Show more adds 15 steps", true);

  // live countdowns: tick each second, flip to "up now" when a window opens, drop a step when its window closes
  const secs = str => { const m = /(?:(\d+)d )?(?:(\d+)h )?(?:(\d+)m)?(?: (\d+)s)?$/.exec(str.trim()); return (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0)); };
  const timed = () => p.$$eval(".lr-step.timed", ls => ls.map(l => ({ id: l.dataset.step, up: l.classList.contains("up"), cd: l.querySelector(".lr-countdown").textContent.replace(/\s+/g, " ").trim() })));
  let tm = await timed();
  const firstUp = tm.find(x => x.up), endsIn = secs(/ends in (.+)$/.exec(firstUp.cd)[1]);
  await p.clock.setFixedTime(new Date((T0 + 5) * 1000));
  await p.waitForFunction(([id, cd]) => document.querySelector(`.lr-step[data-step="${id}"] .lr-countdown`).textContent.replace(/\s+/g, " ").trim() !== cd, [firstUp.id, firstUp.cd]);
  tm = await timed();
  t.check("countdowns tick live", secs(/ends in (.+)$/.exec(tm.find(x => x.id === firstUp.id).cd)[1]) === endsIn - 5, tm.find(x => x.id === firstUp.id));
  const opening = tm.filter(x => !x.up).map(x => ({ ...x, at: T0 + 5 + secs(/\(in (.+?)\)/.exec(x.cd)[1]) })).sort((a, b) => a.at - b.at)[0];
  if (opening) {
    await p.clock.setFixedTime(new Date((opening.at + 1) * 1000));
    await p.waitForFunction(id => document.querySelector(`.lr-step[data-step="${id}"]`)?.classList.contains("up"), opening.id);
    t.check("a step turns 'up now' when its window opens", /^up now, ends in /.test(await text(p, `.lr-step[data-step="${opening.id}"] .lr-countdown`)));
  }
  const stepsBefore = await p.$$eval(".lr-step", l => l.length);
  await p.clock.setFixedTime(new Date((T0 + endsIn + 1) * 1000));
  await p.waitForFunction(id => !document.querySelector(`.lr-step[data-step="${id}"]`), firstUp.id);
  t.check("a step whose window closed is removed; the list refills; summary notes the miss",
    await p.$$eval(".lr-step", l => l.length) === stepsBefore && /^\d+ timed fish missed (its|their) window — Re-plan to fit (it|them) back in\.$/.test(await text(p, ".lr-missed")) && /^1,517 fish left/.test(await text(p, "#lrSummary")));
  await p.click("#lrRecalc");
  await p.waitForFunction(() => !document.querySelector(".lr-missed"));
  t.check("Re-plan clears the missed note", true);
  await p.clock.setFixedTime(new Date(T0 * 1000));
  await p.click("#lrRecalc");
  await p.waitForFunction(() => document.querySelectorAll(".lr-step").length === 15);
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

  // GatherBuddy Reborn: each land step copies an auto-gather list in its clipboard format
  const g = await t.page({ clock: T0, path: null });
  await g.addInitScript(() => { window.__copied = []; Object.defineProperty(navigator, "clipboard", { value: { writeText: async x => { window.__copied.push(x); } } }); });
  await g.goto(t.url + "#route");
  await g.waitForSelector(".lr-step.stop [data-gbr]");
  t.check("GatherBuddy button on land steps, not on ocean steps", await g.$$eval(".lr-step.stop, .lr-step.timed", ss => ss.every(x => x.querySelector("[data-gbr]")))
    && await g.$$eval(".lr-step.ocean [data-gbr]", b => b.length === 0));
  const stopEl = await g.$(".lr-step.stop");
  const stopFish = await stopEl.$$eval(".lr-f [data-mark]", b => b.map(x => +x.dataset.mark));
  const stopNo = await stopEl.$eval(".ns-rank", e => +e.textContent);
  await (await stopEl.$("[data-gbr]")).click();
  await g.waitForFunction(() => window.__copied.length === 1);
  t.check("button confirms the copy", /^Copied/.test(await stopEl.$eval("[data-gbr]", b => b.textContent)));
  const raw = Buffer.from(await g.evaluate(() => window.__copied[0]), "base64");
  const bytes = gunzipSync(raw), cfg = JSON.parse(bytes.subarray(1).toString("utf8"));
  t.check("format: base64 of gzip, version byte 6, then JSON (GatherBuddy's AutoGatherList.Config)", raw[0] === 0x1f && raw[1] === 0x8b && bytes[0] === 6);
  t.check("fields GatherBuddy requires are present", Array.isArray(cfg.ItemIds) && typeof cfg.Name === "string" && typeof cfg.Description === "string"
    && cfg.Quantities && cfg.PrefferedLocations && cfg.EnabledItems && cfg.Enabled === false, Object.keys(cfg));
  const spots = Object.values(cfg.PrefferedLocations);
  t.check("the step's fish, 1 each, pinned to the step's fishing spot", JSON.stringify(cfg.ItemIds) === JSON.stringify(stopFish)
    && cfg.ItemIds.every(id => cfg.Quantities[id] === 1 && cfg.EnabledItems[id] === true) && spots.length === stopFish.length && new Set(spots).size === 1
    && NET.exact[Object.keys(NET.exact).find(k => k.includes("fishing-sources.json"))][stopFish[0]].some(e => e.spot === spots[0]), cfg);
  t.check("list named after the step; description has the fish and bait", cfg.Name.startsWith(`Of Dragons Deep · Step ${stopNo}: `) && /Bait: /.test(cfg.Description), [cfg.Name, cfg.Description]);
  t.noErrors(g, "gatherbuddy");

  // only ocean fish left: one step per voyage stop, with port, spectral-current split and time-of-day voyages
  const data = JSON.parse(await readFile(new URL("../../data/fish.json", import.meta.url), "utf8")), sea = data.tables.reg.indexOf("The High Seas");
  const land = data.rows.filter(r => r[6] !== sea).map(r => r[0]);
  const o = await t.page({ clock: T0, path: "#route", storage: { "odd-caught-v2": JSON.stringify(land) } });
  await o.waitForSelector(".lr-step");
  const os = await steps(o);
  t.check("ocean only: 259 fish left, every step a voyage stop, the first labelled Next", /^259 fish left/.test(await text(o, "#lrSummary")) && os.every(x => x.kind === "ocean") && os[0].when === "Next"
    && /^Ocean fishing from Limsa Lominsa Lower Decks \(Indigo route\) — stop Galadion Bay · \d+ fish$/.test(os[0].where), os.map(x => x.where));
  t.check("ocean: spectral-current fish listed separately; time-of-day voyages named", await o.$$eval(".lr-sub", e => e.length) > 0
    && /need a voyage that reaches Galadion Bay then: .*(Day|Sunset|Night)/.test(await o.$eval(".lr-step .lr-notes", e => e.textContent)));
  t.noErrors(o, "ocean");

  const ph = await t.page({ width: 375, height: 900, clock: T0, path: "#route" });
  await ph.waitForSelector(".lr-step");
  t.check("phone: nav fits, no horizontal overflow", await noOverflow(ph));
  await t.shot(ph, "phone");
}
