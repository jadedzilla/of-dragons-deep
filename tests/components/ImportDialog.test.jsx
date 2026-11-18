// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppContext } from "../../src/context.js";
import { ImportDialog } from "../../src/components/ImportDialog.jsx";

const fish = [1, 2, 3].map(id => ({ id, name: `Fish ${id}` }));
const app = { fishById: new Map(fish.map(f => [f.id, f])), caught: new Set([3]), marks: new Set(), progress: { at: null, items: {} } };
const exportOf = ids => JSON.stringify({ source: "OfDragonsDeep", version: 2, fish: ids });

function setup() {
  const onImported = vi.fn();
  render(<AppContext.Provider value={app}><ImportDialog open onClose={() => {}} onImported={onImported} /></AppContext.Provider>);
  return { onImported, user: userEvent.setup(), box: screen.getByRole("textbox"), go: () => screen.getByRole("button", { name: /import/i }) };
}

describe("Import dialog", () => {
  it("explains what's wrong with something that isn't an export", async () => {
    const { user, box, go, onImported } = setup();
    await user.type(box, "1, 2, 3");
    await user.click(go());
    expect(screen.getByRole("status")).toHaveTextContent("isn't an export from the Of Dragons Deep plugin");
    expect(onImported).not.toHaveBeenCalled();
  });

  it("asks again before Replace unmarks anything", async () => {
    const { user, box, go, onImported } = setup();
    await user.click(box);
    await user.paste(exportOf([1, 2]));
    await user.click(go());
    expect(go()).toHaveTextContent("Unmark 1 fish & import");
    expect(go()).toHaveClass("danger");
    expect(onImported).not.toHaveBeenCalled();
    await user.click(go());
    expect(onImported).toHaveBeenCalledOnce();
    expect([...onImported.mock.calls[0][0].newCaught]).toEqual([1, 2]);
  });

  it("adds without asking", async () => {
    const { user, box, go, onImported } = setup();
    await user.click(screen.getByLabelText(/add to my fish/i));
    await user.click(box);
    await user.paste(exportOf([1]));
    await user.click(go());
    expect([...onImported.mock.calls[0][0].newCaught].sort()).toEqual([1, 3]);
  });
});
