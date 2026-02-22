import { describe, it, expect } from "vitest";

import { UndoTree } from "../UndoTree";
import type { UndoableAction } from "../types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function makeAction(overrides: Partial<UndoableAction> = {}): UndoableAction {
  return {
    type: "test",
    label: "Test action",
    forward: { type: "set_value", payload: { value: 1 } },
    reverse: { type: "set_value", payload: { value: 0 } },
    ...overrides,
  };
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("UndoTree", () => {
  it("starts with a root node and cannot undo", () => {
    const tree = new UndoTree();
    expect(tree.canUndo).toBe(false);
    expect(tree.canRedo).toBe(false);
    expect(tree.getCurrentNode()).toBeDefined();
    expect(tree.getCurrentNode()?.action.type).toBe("init");
  });

  it("pushes actions and enables undo", () => {
    const tree = new UndoTree();
    tree.pushAction(makeAction({ label: "Action 1" }));
    tree.pushAction(makeAction({ label: "Action 2" }));

    expect(tree.canUndo).toBe(true);
    expect(tree.canRedo).toBe(false);
    expect(tree.getCurrentNode()?.action.label).toBe("Action 2");
  });

  it("undo moves back and redo moves forward", () => {
    const tree = new UndoTree();
    tree.pushAction(makeAction({ label: "A1" }));
    tree.pushAction(makeAction({ label: "A2" }));

    const undoneAction = tree.undo();
    expect(undoneAction?.label).toBe("A2");
    expect(tree.canUndo).toBe(true);
    expect(tree.canRedo).toBe(true);
    expect(tree.getCurrentNode()?.action.label).toBe("A1");

    const redoneAction = tree.redo();
    expect(redoneAction?.label).toBe("A2");
    expect(tree.canRedo).toBe(false);
  });

  it("creates a branch when pushing after undo", () => {
    const tree = new UndoTree();
    tree.pushAction(makeAction({ label: "A1" }));
    tree.pushAction(makeAction({ label: "A2" }));

    // Undo back to A1
    tree.undo();
    expect(tree.getCurrentNode()?.action.label).toBe("A1");

    // Push a new action creating a branch
    tree.pushAction(makeAction({ label: "A3-branch" }));
    expect(tree.getCurrentNode()?.action.label).toBe("A3-branch");

    // The parent (A1) should now have 2 children
    tree.undo();
    const branches = tree.getBranches();
    expect(branches.length).toBe(2);
  });

  it("serializes and deserializes correctly", () => {
    const tree = new UndoTree();
    tree.pushAction(makeAction({ label: "First" }));
    tree.pushAction(makeAction({ label: "Second" }));
    tree.undo();

    const json = tree.toJSON();
    const restored = UndoTree.fromJSON(json);

    expect(restored.canUndo).toBe(true);
    expect(restored.canRedo).toBe(true);
    expect(restored.getCurrentNode()?.action.label).toBe("First");

    // Can still redo after deserialization
    const redone = restored.redo();
    expect(redone?.label).toBe("Second");
  });

  it("handles edge cases: undo at root returns null", () => {
    const tree = new UndoTree();
    const result = tree.undo();
    expect(result).toBeNull();
  });

  it("handles edge cases: redo at tip returns null", () => {
    const tree = new UndoTree();
    tree.pushAction(makeAction());
    const result = tree.redo();
    expect(result).toBeNull();
  });
});
