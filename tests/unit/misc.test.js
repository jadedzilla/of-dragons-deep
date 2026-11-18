import { describe, expect, it } from "vitest";
import { pageSlots } from "../../src/lib/pager.js";
import { gatherBuddyList } from "../../src/lib/gatherBuddy.js";
import { gunzipSync } from "node:zlib";

describe("page numbers", () => {
  it("always use the same number of slots, so the arrows never move", () => {
    for (const slots of [3, 5, 7]) for (let page = 0; page < 16; page++) expect(pageSlots(page, 16, slots)).toHaveLength(slots);
    expect(pageSlots(0, 16, 7)).toEqual([0, 1, 2, 3, 4, null, 15]);
    expect(pageSlots(7, 16, 7)).toEqual([0, null, 6, 7, 8, null, 15]);
    expect(pageSlots(7, 16, 5)).toEqual([0, null, 7, null, 15]);
    expect(pageSlots(7, 16, 3)).toEqual([null, 7, null]);
    expect(pageSlots(15, 16, 3)).toEqual([0, null, 15]);
    expect(pageSlots(0, 3, 7)).toEqual([0, 1, 2]);
  });
});

describe("GatherBuddy Reborn list", () => {
  it("is base64 of gzip(version 6 + JSON), each fish at its spot, imported disabled", async () => {
    const text = await gatherBuddyList({ name: "Test", fish: [{ id: 4776, spot: 12 }, { id: 4869, spot: 13 }] });
    const bytes = gunzipSync(Buffer.from(text, "base64"));
    expect(bytes[0]).toBe(6);
    const cfg = JSON.parse(bytes.subarray(1).toString("utf8"));
    expect(cfg).toMatchObject({ ItemIds: [4776, 4869], Quantities: { 4776: 1, 4869: 1 }, PrefferedLocations: { 4776: 12, 4869: 13 },
      Name: "Test", FolderPath: "Of Dragons Deep", Enabled: false });
  });
});
