import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { BranchCleanup } from "../BranchCleanup";
import type { Branch } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeStaleBranch = (overrides: Partial<Branch> = {}): Branch => ({
  id: 1,
  scene_id: 10,
  parent_branch_id: null,
  name: "old-experiment",
  description: null,
  is_default: false,
  depth: 0,
  parameters_snapshot: {},
  created_by_id: 1,
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
  ...overrides,
});

const staleBranches: Branch[] = [
  makeStaleBranch({ id: 10, name: "stale-branch-1", scene_id: 100 }),
  makeStaleBranch({ id: 20, name: "stale-branch-2", scene_id: 200 }),
  makeStaleBranch({ id: 30, name: "stale-branch-3", scene_id: 100 }),
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("BranchCleanup", () => {
  it("renders the cleanup container", () => {
    renderWithProviders(
      <BranchCleanup branches={staleBranches} olderThanDays={30} />,
    );

    expect(screen.getByTestId("branch-cleanup")).toBeInTheDocument();
  });

  it("shows empty state when no stale branches", () => {
    renderWithProviders(
      <BranchCleanup branches={[]} olderThanDays={30} />,
    );

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(
      screen.getByText("No stale branches found."),
    ).toBeInTheDocument();
  });

  it("renders stale branch items", () => {
    renderWithProviders(
      <BranchCleanup branches={staleBranches} olderThanDays={30} />,
    );

    expect(screen.getByTestId("stale-branch-10")).toBeInTheDocument();
    expect(screen.getByTestId("stale-branch-20")).toBeInTheDocument();
    expect(screen.getByTestId("stale-branch-30")).toBeInTheDocument();
  });

  it("calls onFilterChange when days filter is changed", () => {
    const onFilterChange = vi.fn();
    renderWithProviders(
      <BranchCleanup
        branches={staleBranches}
        olderThanDays={30}
        onFilterChange={onFilterChange}
      />,
    );

    fireEvent.change(screen.getByTestId("days-filter"), {
      target: { value: "60" },
    });
    expect(onFilterChange).toHaveBeenCalledWith(60);
  });

  it("calls onBulkDelete with selected ids", () => {
    const onBulkDelete = vi.fn();
    renderWithProviders(
      <BranchCleanup
        branches={staleBranches}
        olderThanDays={30}
        onBulkDelete={onBulkDelete}
      />,
    );

    // Select the first branch's checkbox.
    const checkbox = screen.getByTestId("select-10").querySelector("input");
    if (checkbox) {
      fireEvent.click(checkbox);
    }

    // Click bulk delete.
    fireEvent.click(screen.getByTestId("bulk-delete-btn"));
    expect(onBulkDelete).toHaveBeenCalledWith([10]);
  });
});
