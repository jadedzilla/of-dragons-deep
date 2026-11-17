// Fish Timers page at a fixed moment, checked against the timer engine run in Node on the same recorded data.
import { loadTimerData, nextWindow } from "../../src/timers.js";
import { recordedFetch } from "../lib/network.mjs";
import { gridReady, goTo, importFish, text, noOverflow, T0 } from "../lib/app.mjs";

const fmt = s => { s = Math.round(s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s % 60).padStart(2, "0")}s`; };

export default async function (t) {
  const td = await loadTimerData({ fetchFn: recordedFetch });
  const expected = new Map(td.fish.map(f => [f.id, nextWindow(f, T0)]));
  const expUp = [...expected.values()].filter(w => w && w.start <= T0).length;

  const p = await t.page({ clock: T0 });
  const timerRequests = [];
  p.on("request", r => { if (/\/api\/sheet\/FishingSpot\?|spearfishing-sources/.test(r.url())) timerRequests.push(r.url()); });
  await gridReady(p);
  t.check("the guide alone loads no timer data", timerRequests.length === 0, timerRequests);
  await goTo(p, "timers");
  await p.waitForSelector(".tm-row");
  t.check("page shown: URL #timers, guide/tabs/progress hidden", await p.evaluate(() => location.hash === "#timers" && document.querySelector("#guideView").hidden
    && document.querySelector("#tabs").hidden && document.querySelector(".progress").hidden));
  t.check("Eorzea clock 05:42", await text(p, "#tmClock") === "05:42");
  t.check(`443 timed fish, ${expUp} up now (engine)`, await text(p, "#tmSummary") === `${expUp} up now · 443 of 443 timed fish shown`, await text(p, "#tmSummary"));

  const rows = await p.$$eval(".tm-row", rs => rs.map(r => ({ id: +r.dataset.id, up: r.classList.contains("up"), status: r.querySelector(".tm-status").textContent.replace(/\s+/g, " ").trim() })));
  const ups = rows.filter(r => r.up), rest = rows.slice(ups.length);
  t.check("up-now fish first, each really up", rows.slice(0, ups.length).every(r => r.up) && ups.every(r => { const w = expected.get(r.id); return w && w.start <= T0 && T0 < w.end; }));
  const ends = ups.map(r => expected.get(r.id).end), starts = rest.filter(r => expected.get(r.id)).map(r => expected.get(r.id).start);
  t.check("up-now by soonest end, upcoming by soonest start", ends.every((x, i) => !i || x >= ends[i - 1]) && starts.every((x, i) => !i || x >= starts[i - 1]));
  const first = expected.get(rows[0].id), next = expected.get(rest[0].id);
  t.check("countdowns match the engine", rows[0].status.includes(`ends in ${fmt(first.end - T0)}`) && rest[0].status.startsWith(`in ${fmt(next.start - T0)}`), [rows[0].status, rest[0].status]);

  // time passes: the first fish's window closes → it moves down with its next window
  await p.clock.setFixedTime(new Date((first.end + 1) * 1000));
  await p.waitForFunction(id => !document.querySelector(`.tm-row[data-id="${id}"]`).classList.contains("up"), rows[0].id);
  t.check("a closed window re-sorts the fish", /^in /.test(await text(p, `.tm-row[data-id="${rows[0].id}"] .tm-status`)));
  await p.clock.setFixedTime(new Date(T0 * 1000));

  // filters + details
  await p.check("#tmBigOnly");
  t.check("Big fish only", await p.$$eval(".tm-row", rs => rs.length > 0 && rs.every(r => r.querySelector(".tm-big"))));
  await p.uncheck("#tmBigOnly");
  await p.fill("#tmSearch", "Yanxia");
  t.check("search by zone", await p.$$eval(".tm-row .tm-zone", zs => zs.length > 0 && zs.every(z => z.textContent === "Yanxia")));
  await p.fill("#tmSearch", "");
  const firstId = rows[0].id;
  await p.click(`.tm-row[data-id="${firstId}"]`);
  await p.waitForFunction(() => document.querySelector("#fishDialog").open);
  t.check("clicking a fish opens its details", (await text(p, "#fvFacts")).includes(String(firstId)));
  await p.keyboard.press("Escape");

  // caught fish hidden by default; Back returns to Timers
  await goTo(p, "guide");
  await importFish(p, [firstId]);
  await p.goBack();
  await p.waitForSelector("#timersView:not([hidden])");
  t.check("browser Back returns to Timers; caught fish hidden", !(await p.$(`.tm-row[data-id="${firstId}"]`)));
  await p.uncheck("#tmHideCaught");
  t.check("…shown with ✓ when Hide caught is off", await p.$eval(`.tm-row[data-id="${firstId}"]`, r => r.classList.contains("caught")));
  t.noErrors(p);

  // phone + direct link + failure with retry
  const f = await t.page({ width: 375, height: 800, path: null, clock: T0 });
  await f.route(/spearfishing-sources\.json/, r => r.abort());
  await f.goto(t.url + "#timers");
  await f.waitForSelector("#tmRetry");
  t.check("direct #timers link; failed load shows Try again", /Couldn't load the catch windows/.test(await text(f, "#tmList")));
  await f.unroute(/spearfishing-sources\.json/);
  await f.click("#tmRetry");
  await f.waitForSelector(".tm-row");
  t.check("Try again loads the list", (await f.$$(".tm-row")).length === 443);
  t.check("phone: no horizontal overflow", await noOverflow(f));
  await t.shot(f, "phone");
}
