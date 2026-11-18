import { describe, expect, it } from "vitest";
import { baitChains, hooksetAndTug, loadTeamcraft } from "../../src/lib/teamcraft.js";
import { recordedFetch } from "../fixtures/network.js";

const sources = await loadTeamcraft("fishing-sources", recordedFetch);

describe("bait and hooksets", () => {
  it("follows mooch chains back to a real bait", () => {
    const fake = { 10: [{ spot: 1, bait: 20 }], 20: [{ spot: 1, bait: 30 }, { spot: 2, bait: 31 }] };
    expect(baitChains(fake, 10)).toEqual([{ chains: [[30, 20]], spots: [1] }]);
  });

  it("groups spots with the same bait, most spots first; several baits at one spot are alternatives", () => {
    const fake = { 10: [{ spot: 1, bait: 5 }, { spot: 1, bait: 6 }, { spot: 2, bait: 7 }, { spot: 3, bait: 7 }] };
    expect(baitChains(fake, 10)).toEqual([{ chains: [[7]], spots: [2, 3] }, { chains: [[5], [6]], spots: [1] }]);
  });

  it("has a bait for every land fish in the data", () => {
    const missing = Object.keys(sources).filter(id => sources[id].some(e => e.bait) && !baitChains(sources, +id).length);
    expect(missing).toEqual([]);
  });

  it("names hooksets and tugs, joining ones that differ by spot", () => {
    const fake = { 1: [{ hookset: 2, tug: 2 }], 2: [{ hookset: 1, tug: 1 }, { hookset: 2, tug: 1 }], 3: [{ hookset: 0, tug: -1 }] };
    expect(hooksetAndTug(fake, 1)).toEqual({ hookset: "Precision", tug: "Light (!)" });
    expect(hooksetAndTug(fake, 2)).toEqual({ hookset: "Powerful or Precision", tug: "Heavy (!!!)" });
    expect(hooksetAndTug(fake, 3)).toEqual({ hookset: null, tug: null });
  });
});
