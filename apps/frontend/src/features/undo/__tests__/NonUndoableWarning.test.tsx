/**
 * Tests for NonUndoableWarning component (PRD-51).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { NonUndoableWarning } from "../NonUndoableWarning";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("NonUndoableWarning", () => {
  test("renders warning with action type", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    renderWithProviders(
      <NonUndoableWarning
        actionType="completed_generation"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("This action cannot be undone")).toBeInTheDocument();
    expect(screen.getByText("completed_generation")).toBeInTheDocument();
  });

  test("renders action label when provided", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    renderWithProviders(
      <NonUndoableWarning
        actionType="disk_reclamation"
        actionLabel="Reclaim Disk Space"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(
      screen.getByText(
        /\"Reclaim Disk Space\" is a non-undoable action\./,
      ),
    ).toBeInTheDocument();
  });

  test("confirm button calls onConfirm", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    renderWithProviders(
      <NonUndoableWarning
        actionType="audit_log_entry"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
