/**
 * Tests for ConsistencyHeatmap component (PRD-94).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ConsistencyHeatmap } from "../ConsistencyHeatmap";
import type { PairwiseScores } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockScores: PairwiseScores = {
  matrix: [
    [1.0, 0.92, 0.65],
    [0.92, 1.0, 0.78],
    [0.65, 0.78, 1.0],
  ],
  scene_ids: [1, 2, 3],
  scene_labels: ["Scene A", "Scene B", "Scene C"],
};

const emptyScores: PairwiseScores = {
  matrix: [],
  scene_ids: [],
  scene_labels: [],
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ConsistencyHeatmap", () => {
  test("renders matrix cells with correct colors", () => {
    renderWithProviders(
      <ConsistencyHeatmap scores={mockScores} overallScore={0.78} />,
    );

    // Green cell (0.92 >= 0.85)
    const greenCell = screen.getByTestId("cell-0-1");
    expect(greenCell).toHaveTextContent("92");

    // Red cell (0.65 < 0.7)
    const redCell = screen.getByTestId("cell-0-2");
    expect(redCell).toHaveTextContent("65");

    // Yellow cell (0.78 >= 0.7 and < 0.85)
    const yellowCell = screen.getByTestId("cell-1-2");
    expect(yellowCell).toHaveTextContent("78");
  });

  test("shows scene labels on rows and columns", () => {
    renderWithProviders(
      <ConsistencyHeatmap scores={mockScores} overallScore={0.78} />,
    );

    expect(screen.getAllByText("Scene A")).toHaveLength(2); // header + row
    expect(screen.getAllByText("Scene B")).toHaveLength(2);
    expect(screen.getAllByText("Scene C")).toHaveLength(2);
  });

  test("handles empty matrix gracefully", () => {
    renderWithProviders(
      <ConsistencyHeatmap scores={emptyScores} overallScore={null} />,
    );

    expect(screen.getByText("No pairwise data available.")).toBeInTheDocument();
    expect(screen.queryByTestId("heatmap-table")).not.toBeInTheDocument();
  });

  test("displays overall score when provided", () => {
    renderWithProviders(
      <ConsistencyHeatmap scores={mockScores} overallScore={0.88} />,
    );

    const scoreEl = screen.getByTestId("overall-score");
    expect(scoreEl).toHaveTextContent("Overall Score:");
    expect(scoreEl).toHaveTextContent("88.0%");
  });
});
