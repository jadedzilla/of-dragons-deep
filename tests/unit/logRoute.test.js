import { describe, expect, it } from "vitest";
import { OCEAN_FISHING, loadFish } from "../../src/lib/fishData.js";
import { loadTeamcraft } from "../../src/lib/teamcraft.js";
import { loadTimerData } from "../../src/lib/timers.js";
import { loadOceanRoutes, DELIVERY_FISH, planLogRoute, withoutFish } from "../../src/lib/logRoute.js";

const { fish } = await loadFish();
const [sources, spots, td, ocean] = await Promise.all([loadTeamcraft("fishing-sources"), loadTeamcraft("fishing-spots"),
  loadTimerData(), loadOceanRoutes()]);
const base = { sources, ocean, oceanCategory: OCEAN_FISHING, now: 1794850000,
  windows: new Map(td.fish.map(t => [t.id, t])), spotZone: new Map(spots.map(x => [x.id, x.zoneId])) };
const fishIn = steps => steps.flatMap(s => s.fish ?? [s.f]).map(f => f.id);

describe("log route planner", () => {
  const plan = planLogRoute({ ...base, fish });

  it("plans every fish exactly once", () => {
    const ids = fishIn(plan.steps);
    expect(ids.length).toBe(fish.length);
    expect(new Set(ids).size).toBe(fish.length);
    expect(plan.left).toBe(fish.length);
  });

  it("does spot stops and timed fish first, ocean fishing after", () => {
    const kinds = plan.steps.map(s => s.kind);
    const lastLand = Math.max(kinds.lastIndexOf("stop"), kinds.lastIndexOf("timed"));
    expect(kinds.indexOf("ocean")).toBeGreaterThan(lastLand);
    expect(plan.steps.filter(s => s.kind === "ocean").every(s => s.fish.every(f => f.cat === OCEAN_FISHING))).toBe(true);
  });

  it("only schedules a timed fish inside its window", () => {
    for (const s of plan.steps.filter(s => s.kind === "timed")) {
      expect(s.at).toBeGreaterThanOrEqual(s.w.start);
      expect(s.at).toBeLessThan(s.w.end);
    }
    expect(plan.steps.filter(s => s.kind === "timed").length).toBeGreaterThan(100);
  });

  it("leaves timed fish out when asked", () => {
    const p = planLogRoute({ ...base, fish, includeTimed: false });
    expect(p.steps.some(s => s.kind === "timed" || s.kind === "nowindow")).toBe(false);
    expect(p.leftOut).toBe(fish.filter(f => f.cat !== OCEAN_FISHING && base.windows.has(f.id) && sources[f.id]?.length).length);
    expect(fishIn(p.steps).length + p.leftOut).toBe(fish.length);
  });

  it("leaves big fish out when asked, ocean rares included", () => {
    const p = planLogRoute({ ...base, fish, includeBig: false });
    const ids = fishIn(p.steps), byId = new Map(fish.map(f => [f.id, f]));
    expect(ids.some(id => byId.get(id).big)).toBe(false);
    expect(p.leftOutBig).toBe(fish.filter(f => f.big).length);
    expect(ids.length + p.leftOutBig).toBe(fish.length);
  });

  it("leaves custom delivery fish out when asked", () => {
    const p = planLogRoute({ ...base, fish, includeDelivery: false });
    const ids = fishIn(p.steps), want = fish.filter(f => DELIVERY_FISH.has(f.id)).length;
    expect(want).toBe(DELIVERY_FISH.size);
    expect(ids.some(id => DELIVERY_FISH.has(id))).toBe(false);
    expect(p.leftOutDelivery).toBe(want);
    expect(ids.length + p.leftOutDelivery).toBe(fish.length);
  });

  it("drops a caught fish without changing the order", () => {
    const first = plan.steps.find(s => s.kind === "stop").fish[0];
    const p = withoutFish(plan, first.id);
    expect(fishIn(p.steps)).toEqual(fishIn(plan.steps).filter(id => id !== first.id));
    expect(p.left).toBe(plan.left - 1);
  });

  it("is quick", () => {
    const t = performance.now();
    planLogRoute({ ...base, fish });
    expect(performance.now() - t).toBeLessThan(2000);
  });
});
