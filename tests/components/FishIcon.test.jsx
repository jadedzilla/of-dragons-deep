// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FishIcon } from "../../src/components/FishIcon.jsx";
import { Skeleton } from "../../src/components/Skeleton.jsx";
import fishData from "../../src/data/fish.json";

describe("FishIcon", () => {
  it("draws a fish from its sprite sheet, hidden until the sheet loads", () => {
    const [id, name, icon] = fishData.rows[0];
    const { container } = render(<FishIcon fish={{ id, name, icon }} />);
    const ic = container.querySelector(".ic");
    expect(ic).toHaveClass("s0");
    expect(ic).not.toHaveClass("ready");
    expect(ic.style.backgroundImage).toMatch(/sheet-00/);
  });

  it("loads an icon the sheets don't have from XIVAPI", () => {
    const { container } = render(<FishIcon fish={{ id: 1, name: "New", icon: 99999 }} />);
    expect(container.querySelector("img.ic").src).toContain("v2.xivapi.com/api/asset");
  });

  it("draws a placeholder for a fish with no icon", () => {
    const { container } = render(<FishIcon fish={{ id: 1, name: "Nameless", icon: 0 }} />);
    expect(container.querySelector("svg path")).not.toBeNull();
  });
});

describe("Skeleton", () => {
  it("keeps the loading message for screen readers", () => {
    const { getByRole } = render(<Skeleton kind="timers" label="Loading catch windows…" />);
    expect(getByRole("status")).toHaveTextContent("Loading catch windows…");
  });
});
