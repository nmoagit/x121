/**
 * Tests for ThresholdEditor component (PRD-49).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ThresholdEditor } from "../ThresholdEditor";
import type { QaThreshold } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const thresholds: QaThreshold[] = [
  {
    id: 1,
    project_id: 100,
    check_type: "face_confidence",
    warn_threshold: 0.7,
    fail_threshold: 0.4,
    is_enabled: true,
    created_at: "2026-02-20T10:00:00Z",
    updated_at: "2026-02-20T10:00:00Z",
  },
  {
    id: 2,
    project_id: null,
    check_type: "boundary_ssim",
    warn_threshold: 0.85,
    fail_threshold: 0.65,
    is_enabled: true,
    created_at: "2026-02-20T10:00:00Z",
    updated_at: "2026-02-20T10:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ThresholdEditor", () => {
  test("renders all check types with threshold inputs", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <ThresholdEditor thresholds={thresholds} onSave={onSave} />,
    );

    expect(screen.getByText("Face Confidence")).toBeInTheDocument();
    expect(screen.getByText("Boundary SSIM")).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: /warn threshold for face confidence/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: /fail threshold for boundary ssim/i }),
    ).toBeInTheDocument();
  });

  test("shows studio default indicator when enabled", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <ThresholdEditor
        thresholds={thresholds}
        onSave={onSave}
        showStudioIndicator
      />,
    );

    // boundary_ssim has project_id = null (studio default).
    expect(
      screen.getByTestId("studio-default-boundary_ssim"),
    ).toBeInTheDocument();

    // face_confidence has project_id = 100 (not studio default).
    expect(
      screen.queryByTestId("studio-default-face_confidence"),
    ).not.toBeInTheDocument();
  });

  test("calls onSave on save button click", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <ThresholdEditor thresholds={thresholds} onSave={onSave} />,
    );

    // Change the warn threshold to mark the row dirty.
    const warnInput = screen.getByRole("spinbutton", {
      name: /warn threshold for face confidence/i,
    });
    fireEvent.change(warnInput, { target: { value: "0.8" } });

    // Click save.
    fireEvent.click(screen.getByRole("button", { name: /save face confidence/i }));

    expect(onSave).toHaveBeenCalledWith({
      check_type: "face_confidence",
      warn_threshold: 0.8,
      fail_threshold: 0.4,
      is_enabled: true,
    });
  });
});
