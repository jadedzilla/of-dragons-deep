import { describe, expect, it } from "vitest";
import { decodeImportLink, encodeImportLink, parseImport, planImport } from "../../src/lib/importFormat.js";

const exportOf = (fish, achievements) => JSON.stringify({ source: "OfDragonsDeep", version: 2, fish, ...(achievements && { achievements }) });
const base = { fishIds: new Set([1, 2, 3, 4]), caught: new Set([1, 4]), marks: new Set([100, 101]), progress: { at: null, items: {} } };

describe("plugin export", () => {
  it("only accepts the v2 export", () => {
    expect(parseImport("  ").error).toBe("empty");
    expect(parseImport("1,2,3").error).toBe("notExport");
    expect(parseImport("{nope").error).toBe("badJson");
    expect(parseImport('{"source":"Other"}').error).toBe("notExport");
    expect(parseImport('{"source":"OfDragonsDeep","version":1,"fish":[]}').error).toBe("old");
  });

  it("reads fish, bad entries and achievements", () => {
    const p = parseImport(exportOf([1, 2, 2, "x", -3], [{ id: "5", complete: true }, { id: 6, complete: false, current: 3, max: 10 }]));
    expect(p.ids).toEqual([1, 2]);
    expect(p.invalid).toEqual(["x", "-3"]);
    expect(p.achievements).toEqual([{ id: 5, complete: true, current: undefined, max: undefined }, { id: 6, complete: false, current: 3, max: 10 }]);
  });

  it("Replace makes fish and achievements exactly what the export says", () => {
    const p = planImport(parseImport(exportOf([2, 3, 99], [{ id: 100, complete: false, current: 4, max: 8 }, { id: 102, complete: true }])), { ...base, replace: true });
    expect([...p.newCaught].sort()).toEqual([2, 3]);
    expect(p.fresh).toEqual([2, 3]);
    expect(p.removed).toEqual([1, 4]);
    expect(p.unknown).toEqual([99]);
    expect([...p.newMarks].sort()).toEqual([101, 102]);
    expect(p.newProgress.items).toEqual({ 100: [4, 8] });
    expect(p.needsConfirm).toBe(true);
  });

  it("Add only adds", () => {
    const p = planImport(parseImport(exportOf([2], [{ id: 100, complete: false }])), { ...base, replace: false });
    expect([...p.newCaught].sort()).toEqual([1, 2, 4]);
    expect(p.removed).toEqual([]);
    expect(p.newMarks.has(100)).toBe(true);
    expect(p.needsConfirm).toBe(false);
  });

  it("notices an export with nothing in it", () => {
    expect(planImport(parseImport(exportOf([99])), { ...base, replace: false }).empty).toBe(true);
  });
});

describe("import links", () => {
  it("round-trip fish and achievements", async () => {
    const data = { fish: [4776, 7678, 12713], achievements: [{ id: 2557, complete: true }, { id: 2558, complete: false, current: 42000, max: 100000 }, { id: 916, complete: false }] };
    const link = await encodeImportLink(data);
    expect(link).toMatch(/^2\.[A-Za-z0-9_-]+$/);
    const back = JSON.parse(await decodeImportLink(link));
    expect(back.fish).toEqual([4776, 7678, 12713]);
    expect(back.achievements).toEqual([{ id: 916, complete: false }, { id: 2557, complete: true }, { id: 2558, complete: false, current: 42000, max: 100000 }]);
  });

  it("reject old and broken links", async () => {
    await expect(decodeImportLink("1.abc")).rejects.toMatchObject({ old: true });
    await expect(decodeImportLink("4776,7678")).rejects.toMatchObject({ old: true });
    await expect(decodeImportLink("3.xyz")).rejects.toThrow();
  });
});
