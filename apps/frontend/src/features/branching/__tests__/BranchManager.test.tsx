import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { BranchManager } from "../BranchManager";
import type { Branch } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeBranch = (overrides: Partial<Branch> = {}): Branch => ({
  id: 1,
  scene_id: 10,
  parent_branch_id: null,
  name: "main",
  description: null,
  is_default: true,
  depth: 0,
  parameters_snapshot: { strength: 0.8 },
  created_by_id: 1,
  created_at: "2026-02-23T10:00:00Z",
  updated_at: "2026-02-23T10:00:00Z",
  ...overrides,
});

const branches: Branch[] = [
  makeBranch({ id: 1, name: "main", is_default: true }),
  makeBranch({ id: 2, name: "experiment-a", is_default: false, depth: 1 }),
  makeBranch({ id: 3, name: "experiment-b", is_default: false }),
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("BranchManager", () => {
  it("renders the branch list", () => {
    renderWithProviders(<BranchManager branches={branches} />);

    expect(screen.getByTestId("branch-manager")).toBeInTheDocument();
    expect(screen.getByTestId("branch-item-1")).toBeInTheDocument();
    expect(screen.getByTestId("branch-item-2")).toBeInTheDocument();
    expect(screen.getByTestId("branch-item-3")).toBeInTheDocument();
  });

  it("shows default branch badge", () => {
    renderWithProviders(<BranchManager branches={branches} />);

    expect(screen.getByTestId("default-badge-1")).toBeInTheDocument();
    expect(screen.queryByTestId("default-badge-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("default-badge-3")).not.toBeInTheDocument();
  });

  it("prevents deleting default branch (no delete button)", () => {
    const onDelete = vi.fn();
    renderWithProviders(
      <BranchManager branches={branches} onDelete={onDelete} />,
    );

    // Default branch should not have a delete button.
    expect(screen.queryByTestId("delete-btn-1")).not.toBeInTheDocument();
    // Non-default branches should have delete buttons.
    expect(screen.getByTestId("delete-btn-2")).toBeInTheDocument();
    expect(screen.getByTestId("delete-btn-3")).toBeInTheDocument();
  });

  it("calls onDelete when delete button is clicked", () => {
    const onDelete = vi.fn();
    renderWithProviders(
      <BranchManager branches={branches} onDelete={onDelete} />,
    );

    fireEvent.click(screen.getByTestId("delete-btn-2"));
    expect(onDelete).toHaveBeenCalledWith(2);
  });

  it("calls onPromote when promote button is clicked", () => {
    const onPromote = vi.fn();
    renderWithProviders(
      <BranchManager branches={branches} onPromote={onPromote} />,
    );

    // Default branch should not have promote button.
    expect(screen.queryByTestId("promote-btn-1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("promote-btn-2"));
    expect(onPromote).toHaveBeenCalledWith(2);
  });

  it("shows empty state when no branches", () => {
    renderWithProviders(<BranchManager branches={[]} />);

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("shows branch count in header", () => {
    renderWithProviders(<BranchManager branches={branches} />);

    expect(screen.getByText("Branches (3)")).toBeInTheDocument();
  });

  it("shows depth indicator for nested branches", () => {
    renderWithProviders(<BranchManager branches={branches} />);

    // Branch 2 has depth 1.
    expect(screen.getByTestId("depth-indicator-2")).toBeInTheDocument();
    // Branch 1 has depth 0 -- no indicator.
    expect(screen.queryByTestId("depth-indicator-1")).not.toBeInTheDocument();
  });

  it("shows create form when New Branch is clicked", () => {
    const onCreate = vi.fn();
    renderWithProviders(
      <BranchManager branches={branches} onCreate={onCreate} />,
    );

    fireEvent.click(screen.getByTestId("create-branch-btn"));
    expect(screen.getByTestId("create-branch-form")).toBeInTheDocument();
  });
});
