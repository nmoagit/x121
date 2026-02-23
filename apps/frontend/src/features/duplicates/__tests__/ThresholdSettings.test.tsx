/**
 * Tests for ThresholdSettings component (PRD-79).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ThresholdSettings } from "../ThresholdSettings";
import type { DuplicateDetectionSetting } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const settings: DuplicateDetectionSetting = {
  id: 1,
  project_id: null,
  similarity_threshold: 0.9,
  auto_check_on_upload: true,
  auto_check_on_batch: false,
  created_at: "2026-02-22T10:00:00Z",
  updated_at: "2026-02-22T10:00:00Z",
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ThresholdSettings", () => {
  test("renders threshold slider with correct initial value", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <ThresholdSettings settings={settings} onSave={onSave} />,
    );

    const slider = screen.getByLabelText("Similarity threshold slider");
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveValue("90");
  });

  test("renders auto-check toggles with correct initial state", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <ThresholdSettings settings={settings} onSave={onSave} />,
    );

    expect(screen.getByText("Auto-check on upload")).toBeInTheDocument();
    expect(screen.getByText("Auto-check on batch")).toBeInTheDocument();
  });

  test("calls onSave with updated values when save is clicked", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <ThresholdSettings settings={settings} onSave={onSave} />,
    );

    // Change threshold to trigger dirty state
    const thresholdInput = screen.getByLabelText("Similarity threshold value");
    fireEvent.change(thresholdInput, { target: { value: "85" } });

    // Click save
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    expect(onSave).toHaveBeenCalledWith({
      similarity_threshold: 0.85,
      auto_check_on_upload: true,
      auto_check_on_batch: false,
    });
  });
});
