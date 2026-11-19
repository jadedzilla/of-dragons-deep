import { describe, expect, it } from "vitest";
import { buildDataset, expansionOf, logOrder } from "../../scripts/data/fish.mjs";
import { CATEGORIES, OCEAN_FISHING, decode, loadFish } from "../../src/lib/fishData.js";

const { fish, spear, patch } = await loadFish();

describe("fish data", () => {
  it("has the whole Fish Guide and spearfishing log", () => {
    expect(fish.length).toBeGreaterThan(1500);
    expect(spear.length).toBeGreaterThan(280);
    expect(new Set([...fish, ...spear].map(f => f.id)).size).toBe(fish.length + spear.length); // ids never overlap
    expect(patch).toMatch(/^\d+\.\d+/);
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
});

describe("building the dataset (scripts/data/fish.mjs)", () => {
  it("orders by the game's sort key, then row", () => {
    const rows = [{ row_id: 3, fields: { Unknown1: 3000 } }, { row_id: 1, fields: { Unknown1: 3000 } }, { row_id: 9, fields: { Unknown1: 2000 } }];
    expect(logOrder(rows).map(r => r.row_id)).toEqual([9, 1, 3]);
  });

  it("takes the expansion from the level band, raised to the region's", () => {
    expect([1, 50, 51, 60, 61, 80, 90, 91, 100].map(l => expansionOf(l, "La Noscea"))).toEqual([0, 0, 1, 1, 2, 3, 4, 5, 5]);
    expect(expansionOf(50, "Norvrandt")).toBe(3);
  });

  it("keeps log fish only, as compact rows", () => {
    const node = (value, fields) => ({ value, fields });
    const row = (id, item, inLog, level, region, rarity) => ({ row_id: id, fields: {
      Unknown1: 2000, IsInLog: inLog, GatheringItemLevel: node(1, { GatheringItemLevel: level }),
      Item: node(item, { Name: `Fish ${item}`, Icon: { id: 29000 + item }, IsCollectable: false, Rarity: rarity }),
      FishingRecordType: node(1, { Addon: node(1, { Text: "Rivers" }) }),
      FishingSpot: node(1, { TerritoryType: node(1, { PlaceName: node(1, { Name: "Zone" }), PlaceNameRegion: node(1, { Name: region }) }) }),
    } });
    const data = buildDataset([row(1, 100, true, 55, "La Noscea", 2), row(2, 101, false, 10, "La Noscea", 1)], { patch: "7.0" });
    const [f] = decode(data.tables, data.rows);
    expect(data.rows.length).toBe(1);
    expect(f).toMatchObject({ id: 100, name: "Fish 100", lvl: 55, cat: 1, water: "Rivers", zone: "Zone", big: true });
  });
});
