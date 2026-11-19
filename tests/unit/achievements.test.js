import { describe, expect, it } from "vitest";
import { achievementState, loadAchievements } from "../../src/lib/achievements.js";
import { loadFish } from "../../src/lib/fishData.js";

const lists = await loadFish();
const allFish = [...lists.fish, ...lists.spear];
const fishById = new Map(allFish.map(f => [f.id, f]));
const data = await loadAchievements();
const state = (caught, marks = new Set()) => achievementState(data, { allFish, fishById, isCaught: id => caught.has(id), marks, progress: { at: null, items: {} } });

describe("achievements", () => {
  const s = state(new Set());
  const byName = name => data.achievements.find(a => a.name === name);

  it("loads every Fisher achievement", () => {
    expect(data.achievements.length).toBeGreaterThan(120);
    expect(data.oceanSpots.length).toBeGreaterThan(10);
  });

  it("works out fish-based requirements; the top tiers equal the totals", () => {
    const counts = data.achievements.map(a => s.reqs.get(a.id)).filter(r => r.kind === "count");
    for (const section of ["log", "big"]) {
      const top = counts.filter(r => r.section === section).reduce((m, r) => (r.need > m.need ? r : m));
      if (section === "big") expect(top.need).toBe(top.fish.length);
      else expect(top.fish.length).toBeGreaterThanOrEqual(top.need);
    }
    const sets = data.achievements.map(a => s.reqs.get(a.id)).filter(r => r.kind === "set");
    expect(sets.length).toBe(26);
    expect(sets.every(r => r.fish.length > 0)).toBe(true);
  });

  it("counts caught fish, and a mark (the game's word) beats the count", () => {
    const first = data.achievements.find(a => s.reqs.get(a.id).kind === "count" && s.reqs.get(a.id).section === "log");
    const need = s.reqs.get(first.id).need;
    expect(state(new Set(allFish.slice(0, need - 1).map(f => f.id))).isDone(first)).toBe(false);
    expect(state(new Set(allFish.slice(0, need).map(f => f.id))).isDone(first)).toBe(true);
    expect(state(new Set(), new Set([first.id])).isDone(first)).toBe(true);
  });

  it("obtains a meta achievement once all its parts are", () => {
    const meta = data.achievements.find(a => s.reqs.get(a.id).kind === "meta");
    const parts = s.reqs.get(meta.id).ids;
    expect(state(new Set(), new Set(parts.slice(1))).isDone(meta)).toBe(false);
    expect(state(new Set(), new Set(parts)).isDone(meta)).toBe(true);
    expect(byName(meta.name)).toBe(meta);
  });
});
