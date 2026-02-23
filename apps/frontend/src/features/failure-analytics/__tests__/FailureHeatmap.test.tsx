/**
 * Tests for FailureHeatmap component (PRD-64).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { FailureHeatmap } from "../FailureHeatmap";
import type { HeatmapData } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const mockHeatmapData: HeatmapData = {
  cells: [
    {
      row: "Workflow 1",
      col: "Character 1",
      failure_rate: 0.6,
      sample_count: 20,
      severity: "high",
    },
    {
      row: "Workflow 1",
      col: "Character 2",
      failure_rate: 0.15,
      sample_count: 30,
      severity: "low",
    },
    {
      row: "Workflow 2",
      col: "Character 1",
      failure_rate: 0.3,
      sample_count: 15,
      severity: "medium",
    },
  ],
  row_labels: ["Workflow 1", "Workflow 2"],
  col_labels: ["Character 1", "Character 2"],
};

vi.mock("../hooks/use-failure-analytics", () => ({
  useFailureHeatmap: () => ({
    data: mockHeatmapData,
    isPending: false,
    isError: false,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("FailureHeatmap", () => {
  test("renders grid cells with percentages", () => {
    renderWithProviders(<FailureHeatmap />);

    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("15%")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
  });

  test("renders row and column labels", () => {
    renderWithProviders(<FailureHeatmap />);

    // Row labels appear in the table body.
    expect(screen.getByText("Workflow 1")).toBeInTheDocument();
    expect(screen.getByText("Workflow 2")).toBeInTheDocument();
    // Column labels appear in the table header.
    expect(screen.getByText("Character 1")).toBeInTheDocument();
    expect(screen.getByText("Character 2")).toBeInTheDocument();
  });

  test("renders severity badges", () => {
    renderWithProviders(<FailureHeatmap />);

    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("low")).toBeInTheDocument();
  });

  test("renders dimension selector dropdowns", () => {
    renderWithProviders(<FailureHeatmap />);

    expect(screen.getByTestId("row-dimension-select")).toBeInTheDocument();
    expect(screen.getByTestId("col-dimension-select")).toBeInTheDocument();
  });
});
