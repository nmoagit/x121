/**
 * Tests for ScoreDiffDisplay component (PRD-65).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ScoreDiffDisplay } from "../ScoreDiffDisplay";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const baselineScores: Record<string, number> = {
  face_confidence: 0.85,
  boundary_ssim: 0.72,
  motion: 0.6,
};

const newScores: Record<string, number> = {
  face_confidence: 0.9,
  boundary_ssim: 0.65,
  motion: 0.6,
};

const scoreDiffs: Record<string, number> = {
  face_confidence: 0.05,
  boundary_ssim: -0.07,
  motion: 0.0,
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ScoreDiffDisplay", () => {
  test("renders metric rows with old and new scores", () => {
    renderWithProviders(
      <ScoreDiffDisplay
        baselineScores={baselineScores}
        newScores={newScores}
        scoreDiffs={scoreDiffs}
      />,
    );

    // Check metric labels (from qa-constants).
    expect(screen.getByText("Face Confidence")).toBeInTheDocument();
    expect(screen.getByText("Boundary SSIM")).toBeInTheDocument();

    // Check baseline and new scores appear.
    const faceRow = screen.getByTestId("score-row-face_confidence");
    expect(faceRow).toHaveTextContent("0.85");
    expect(faceRow).toHaveTextContent("0.90");
  });

  test("shows positive diffs in green (success color)", () => {
    renderWithProviders(
      <ScoreDiffDisplay
        baselineScores={baselineScores}
        newScores={newScores}
        scoreDiffs={scoreDiffs}
      />,
    );

    const faceDiff = screen.getByTestId("score-diff-face_confidence");
    expect(faceDiff).toHaveTextContent("+0.05");
    expect(faceDiff.className).toContain("color-action-success");
  });

  test("shows negative diffs in red (danger color)", () => {
    renderWithProviders(
      <ScoreDiffDisplay
        baselineScores={baselineScores}
        newScores={newScores}
        scoreDiffs={scoreDiffs}
      />,
    );

    const ssimDiff = screen.getByTestId("score-diff-boundary_ssim");
    expect(ssimDiff).toHaveTextContent("-0.07");
    expect(ssimDiff.className).toContain("color-action-danger");
  });

  test("handles empty score objects", () => {
    renderWithProviders(
      <ScoreDiffDisplay baselineScores={{}} newScores={{}} scoreDiffs={{}} />,
    );

    const display = screen.getByTestId("score-diff-display");
    expect(display).toHaveTextContent("No score data available");
  });
});
