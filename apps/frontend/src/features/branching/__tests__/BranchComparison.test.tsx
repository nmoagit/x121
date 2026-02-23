import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { BranchComparison } from "../BranchComparison";
import type { BranchComparison as BranchComparisonData } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const comparison: BranchComparisonData = {
  branch_a: {
    id: 1,
    scene_id: 10,
    parent_branch_id: null,
    name: "main",
    description: null,
    is_default: true,
    depth: 0,
    parameters_snapshot: { strength: 0.8, seed: 42 },
    created_by_id: 1,
    created_at: "2026-02-23T10:00:00Z",
    updated_at: "2026-02-23T10:00:00Z",
    segment_count: 5,
  },
  branch_b: {
    id: 2,
    scene_id: 10,
    parent_branch_id: 1,
    name: "experiment-a",
    description: "Testing new params",
    is_default: false,
    depth: 1,
    parameters_snapshot: { strength: 0.9, model: "v2" },
    created_by_id: 1,
    created_at: "2026-02-23T11:00:00Z",
    updated_at: "2026-02-23T11:00:00Z",
    segment_count: 3,
  },
  diffs: [
    { key: "model", value_a: null, value_b: '"v2"', status: "added" },
    { key: "seed", value_a: "42", value_b: null, status: "removed" },
    { key: "strength", value_a: "0.8", value_b: "0.9", status: "changed" },
  ],
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("BranchComparison", () => {
  it("renders the comparison container", () => {
    renderWithProviders(<BranchComparison comparison={comparison} />);

    expect(screen.getByTestId("branch-comparison")).toBeInTheDocument();
  });

  it("shows branch summaries with names", () => {
    renderWithProviders(<BranchComparison comparison={comparison} />);

    expect(screen.getByTestId("branch-a-summary")).toHaveTextContent("main");
    expect(screen.getByTestId("branch-b-summary")).toHaveTextContent(
      "experiment-a",
    );
  });

  it("shows segment counts", () => {
    renderWithProviders(<BranchComparison comparison={comparison} />);

    expect(screen.getByTestId("segment-count-a")).toHaveTextContent(
      "5 segments",
    );
    expect(screen.getByTestId("segment-count-b")).toHaveTextContent(
      "3 segments",
    );
  });

  it("renders parameter diff rows", () => {
    renderWithProviders(<BranchComparison comparison={comparison} />);

    expect(screen.getByTestId("diff-table")).toBeInTheDocument();
    expect(screen.getByTestId("diff-row-model")).toBeInTheDocument();
    expect(screen.getByTestId("diff-row-seed")).toBeInTheDocument();
    expect(screen.getByTestId("diff-row-strength")).toBeInTheDocument();
  });

  it("shows diff status badges", () => {
    renderWithProviders(<BranchComparison comparison={comparison} />);

    expect(screen.getByText("Added")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(screen.getByText("Changed")).toBeInTheDocument();
  });

  it("shows no-diffs message when parameters are identical", () => {
    const identicalComparison: BranchComparisonData = {
      ...comparison,
      diffs: [],
    };
    renderWithProviders(
      <BranchComparison comparison={identicalComparison} />,
    );

    expect(screen.getByTestId("no-diffs")).toBeInTheDocument();
    expect(
      screen.getByText("Both branches have identical parameters."),
    ).toBeInTheDocument();
  });
});
