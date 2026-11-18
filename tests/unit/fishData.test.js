import { describe, expect, it } from "vitest";
import { loadFishFromXivapi, logOrder } from "../../src/lib/fishSource.js";
import { CATEGORIES, OCEAN_FISHING, decode } from "../../src/lib/fishData.js";
import snapshot from "../../src/data/fish.json";
import { recordedFetch } from "../fixtures/network.js";

const live = await loadFishFromXivapi({ fetchFn: recordedFetch });
const fish = decode(live.tables, live.rows, false, live.aquarium), spear = decode(live.tables, live.spear, true, live.aquarium);

describe("fish data", () => {
  it("loads the whole Fish Guide and spearfishing log", () => {
    expect(fish.length).toBeGreaterThan(1500);
    expect(spear.length).toBeGreaterThan(280);
    expect(new Set([...fish, ...spear].map(f => f.id)).size).toBe(fish.length + spear.length); // ids never overlap
  });

  it("matches the committed snapshot, in the same order", () => {
    const snap = decode(snapshot.tables, snapshot.rows, false, snapshot.aquarium);
    expect(fish.map(f => [f.id, f.name, f.lvl, f.cat, f.zone, f.big, f.collectable])).toEqual(
      snap.map(f => [f.id, f.name, f.lvl, f.cat, f.zone, f.big, f.collectable]));
  });

  it("puts ocean fishing in its own category and marks rares as big fish", () => {
    const ocean = fish.filter(f => f.cat === OCEAN_FISHING);
    expect(ocean.length).toBeGreaterThan(200);
    expect(ocean.every(f => f.region === "The High Seas")).toBe(true);
    expect(fish.filter(f => f.big).length).toBeGreaterThan(300);
    expect(spear.some(f => f.big)).toBe(false);
    expect(CATEGORIES[fish[0].cat]).toBe("A Realm Reborn");
  });

  it("knows aquarium sizes", () => {
    const withTank = [...fish, ...spear].filter(f => f.aquarium);
    expect(withTank.length).toBeGreaterThan(200);
    expect(withTank.every(f => f.aquarium.size >= 1 && f.aquarium.size <= 4)).toBe(true);
  });

  it("orders by the game's sort key, then row", () => {
    const rows = [{ row_id: 3, fields: { Unknown1: 3000 } }, { row_id: 1, fields: { Unknown1: 3000 } }, { row_id: 9, fields: { Unknown1: 2000 } }];
    expect(logOrder(rows).map(r => r.row_id)).toEqual([9, 1, 3]);
  });
});
