/**
 * Tests for HistoryBrowser component (PRD-51).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { HistoryBrowser } from "../HistoryBrowser";
import { UndoTree } from "../UndoTree";
import type { UndoableAction } from "../types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function makeAction(label: string): UndoableAction {
  return {
    type: "test",
    label,
    forward: { type: "set_value", payload: { value: 1 } },
    reverse: { type: "set_value", payload: { value: 0 } },
  };
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("HistoryBrowser", () => {
  test("renders tree with root node", () => {
    const tree = new UndoTree();
    const onNavigate = vi.fn();

    renderWithProviders(
      <HistoryBrowser tree={tree} onNavigate={onNavigate} />,
    );

    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Initial state")).toBeInTheDocument();
  });

  test("shows current node badge on active node", () => {
    const tree = new UndoTree();
    tree.pushAction(makeAction("Move element"));
    const onNavigate = vi.fn();

    renderWithProviders(
      <HistoryBrowser tree={tree} onNavigate={onNavigate} />,
    );

    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Move element")).toBeInTheDocument();
  });

  test("click on a node calls onNavigate", () => {
    const tree = new UndoTree();
    tree.pushAction(makeAction("Action A"));
    tree.pushAction(makeAction("Action B"));
    const onNavigate = vi.fn();

    renderWithProviders(
      <HistoryBrowser tree={tree} onNavigate={onNavigate} />,
    );

    // Click on the root node
    fireEvent.click(screen.getByText("Initial state"));

    expect(onNavigate).toHaveBeenCalledWith("root");
  });

  test("shows branch count for nodes with multiple children", () => {
    const tree = new UndoTree();
    tree.pushAction(makeAction("Branch 1"));
    tree.undo();
    tree.pushAction(makeAction("Branch 2"));
    tree.undo();

    const onNavigate = vi.fn();

    renderWithProviders(
      <HistoryBrowser tree={tree} onNavigate={onNavigate} />,
    );

    expect(screen.getByText("2 branches")).toBeInTheDocument();
  });
});
