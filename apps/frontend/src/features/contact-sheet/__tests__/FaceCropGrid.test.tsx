/**
 * Tests for FaceCropGrid component (PRD-103).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { FaceCropGrid } from "../FaceCropGrid";
import type { ContactSheetImage } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const makeImage = (overrides: Partial<ContactSheetImage> = {}): ContactSheetImage => ({
  id: 1,
  character_id: 10,
  scene_id: 100,
  face_crop_path: "/crops/face_001.png",
  confidence_score: 0.95,
  frame_number: 42,
  created_at: "2026-02-28T10:00:00Z",
  updated_at: "2026-02-28T10:00:00Z",
  ...overrides,
});

const images: ContactSheetImage[] = [
  makeImage({ id: 1, scene_id: 100, confidence_score: 0.95 }),
  makeImage({ id: 2, scene_id: 101, confidence_score: 0.72 }),
  makeImage({ id: 3, scene_id: 102, confidence_score: 0.55 }),
];

const sceneLabels: Record<number, string> = {
  100: "Opening Shot",
  101: "Dialogue A",
  102: "Close-up",
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("FaceCropGrid", () => {
  test("renders image cells for each face crop", () => {
    renderWithProviders(
      <FaceCropGrid images={images} sceneLabels={sceneLabels} />,
    );

    const cells = screen.getAllByTestId("face-crop-cell");
    expect(cells).toHaveLength(3);
  });

  test("shows confidence badges with correct scores", () => {
    renderWithProviders(
      <FaceCropGrid images={images} sceneLabels={sceneLabels} />,
    );

    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();
  });

  test("handles empty state when no images", () => {
    renderWithProviders(<FaceCropGrid images={[]} />);

    expect(screen.getByTestId("face-crop-grid-empty")).toBeInTheDocument();
    expect(screen.getByText("No face crops available.")).toBeInTheDocument();
  });

  test("shows selection checkboxes when onSelectionChange is provided", () => {
    const handleSelection = vi.fn();

    renderWithProviders(
      <FaceCropGrid
        images={images}
        sceneLabels={sceneLabels}
        onSelectionChange={handleSelection}
      />,
    );

    // Each cell should have a checkbox input
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
  });
});
