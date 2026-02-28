/**
 * Tests for QAScoreComparison component (PRD-101).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { QAScoreComparison } from "../QAScoreComparison";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const oldScores: Record<string, number> = {
  face_confidence: 0.82,
  boundary_ssim: 0.75,
  motion: 0.9,
};

const newScores: Record<string, number> = {
  face_confidence: 0.89,
  boundary_ssim: 0.71,
  motion: 0.9,
};

const scoreDiffs: Record<string, number> = {
  face_confidence: 0.07,
  boundary_ssim: -0.04,
  motion: 0.0,
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("QAScoreComparison", () => {
  test("renders metric labels using qaMetricLabel", () => {
    renderWithProviders(
      <QAScoreComparison oldScores={oldScores} newScores={newScores} scoreDiffs={scoreDiffs} />,
    );

    expect(screen.getByText("Face Confidence")).toBeInTheDocument();
    expect(screen.getByText("Boundary SSIM")).toBeInTheDocument();
    expect(screen.getByText("Motion Continuity")).toBeInTheDocument();
  });

  test("renders improvements in green (positive diff)", () => {
    renderWithProviders(
      <QAScoreComparison oldScores={oldScores} newScores={newScores} scoreDiffs={scoreDiffs} />,
    );

    const faceDiff = screen.getByTestId("qa-diff-face_confidence");
    expect(faceDiff).toHaveTextContent("(+0.07)");
    expect(faceDiff.className).toContain("success");
  });

  test("renders degradation in red (negative diff)", () => {
    renderWithProviders(
      <QAScoreComparison oldScores={oldScores} newScores={newScores} scoreDiffs={scoreDiffs} />,
    );

    const ssimDiff = screen.getByTestId("qa-diff-boundary_ssim");
    expect(ssimDiff).toHaveTextContent("(-0.04)");
    expect(ssimDiff.className).toContain("danger");
  });

  test("renders zero diff in muted color", () => {
    renderWithProviders(
      <QAScoreComparison oldScores={oldScores} newScores={newScores} scoreDiffs={scoreDiffs} />,
    );

    const motionDiff = screen.getByTestId("qa-diff-motion");
    expect(motionDiff).toHaveTextContent("(0.00)");
    expect(motionDiff.className).toContain("muted");
  });

  test("handles null scores gracefully", () => {
    renderWithProviders(<QAScoreComparison oldScores={null} newScores={null} scoreDiffs={null} />);

    expect(screen.getByText("No QA scores available")).toBeInTheDocument();
  });

  test("handles partially null scores (old only)", () => {
    renderWithProviders(
      <QAScoreComparison oldScores={oldScores} newScores={null} scoreDiffs={null} />,
    );

    // Should still render the metrics from old scores.
    expect(screen.getByText("Face Confidence")).toBeInTheDocument();
  });

  test("shows overall Improved badge when all diffs are positive", () => {
    const allPositive = { face_confidence: 0.05, boundary_ssim: 0.1 };

    renderWithProviders(
      <QAScoreComparison oldScores={oldScores} newScores={newScores} scoreDiffs={allPositive} />,
    );

    expect(screen.getByTestId("qa-overall-trend")).toHaveTextContent("Improved");
  });

  test("shows overall Degraded badge when all diffs are negative", () => {
    const allNegative = { face_confidence: -0.05, boundary_ssim: -0.1 };

    renderWithProviders(
      <QAScoreComparison oldScores={oldScores} newScores={newScores} scoreDiffs={allNegative} />,
    );

    expect(screen.getByTestId("qa-overall-trend")).toHaveTextContent("Degraded");
  });
});
