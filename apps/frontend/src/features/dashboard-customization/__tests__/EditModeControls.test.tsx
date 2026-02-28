/**
 * Tests for EditModeControls component (PRD-89).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { EditModeControls } from "../EditModeControls";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("EditModeControls", () => {
  const defaultProps = {
    isEditing: false,
    onToggleEdit: vi.fn(),
    onAddWidget: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  test("shows Edit Dashboard button in view mode", () => {
    renderWithProviders(<EditModeControls {...defaultProps} />);

    expect(screen.getByTestId("edit-mode-controls")).toBeInTheDocument();
    expect(screen.getByText("Edit Dashboard")).toBeInTheDocument();
  });

  test("does not show Save/Cancel in view mode", () => {
    renderWithProviders(<EditModeControls {...defaultProps} />);

    expect(screen.queryByText("Save")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });

  test("shows Add Widget, Save, and Cancel in edit mode", () => {
    renderWithProviders(
      <EditModeControls {...defaultProps} isEditing={true} />,
    );

    expect(screen.getByText("Add Widget")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  test("calls onToggleEdit when Edit Dashboard is clicked", () => {
    const onToggleEdit = vi.fn();
    renderWithProviders(
      <EditModeControls {...defaultProps} onToggleEdit={onToggleEdit} />,
    );

    fireEvent.click(screen.getByText("Edit Dashboard"));

    expect(onToggleEdit).toHaveBeenCalledOnce();
  });

  test("calls onSave when Save is clicked", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <EditModeControls {...defaultProps} isEditing={true} onSave={onSave} />,
    );

    fireEvent.click(screen.getByText("Save"));

    expect(onSave).toHaveBeenCalledOnce();
  });

  test("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <EditModeControls
        {...defaultProps}
        isEditing={true}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByText("Cancel"));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
