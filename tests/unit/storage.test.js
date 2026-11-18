// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { KEYS, noteObtained } from "../../src/lib/storage.js";

describe("recently obtained", () => {
  it("dates achievements from when they were first seen obtained", () => {
    expect(noteObtained([1, 2])).toEqual({ 1: 0, 2: 0 }); // already obtained the first time
    const seen = noteObtained([1, 2, 3]);
    expect(seen[3]).toBeGreaterThan(0);
    expect(noteObtained([3])).toEqual({ 3: seen[3] }); // no longer obtained: dropped
    expect(JSON.parse(localStorage.getItem(KEYS.seen))).toEqual({ 3: seen[3] });
  });
});
