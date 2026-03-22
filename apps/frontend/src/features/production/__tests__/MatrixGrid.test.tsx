import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { MatrixGrid } from "../MatrixGrid";
import type { ProductionRunCell } from "../types";

const avatars = [
  { id: 1, name: "Luna" },
  { id: 2, name: "Kai" },
];

const columns = [
  { scene_type_id: 10, scene_type_name: "Dance", track_id: null, track_name: null },
  { scene_type_id: 20, scene_type_name: "Idle", track_id: null, track_name: null },
];

function makeCell(
  id: number,
  avatarId: number,
  sceneTypeId: number,
  statusId: number,
  blockingReason?: string,
): ProductionRunCell {
  return {
    id,
    run_id: 1,
    avatar_id: avatarId,
    scene_type_id: sceneTypeId,
    track_id: null,
    variant_label: "default",
    status_id: statusId,
    scene_id: null,
    job_id: null,
    blocking_reason: blockingReason ?? null,
    error_message: null,
    created_at: "2026-02-23T00:00:00Z",
    updated_at: "2026-02-23T00:00:00Z",
  };
}

const cells: ProductionRunCell[] = [
  makeCell(1, 1, 10, 1), // Luna x Dance — not started
  makeCell(2, 1, 20, 3), // Luna x Idle — approved
  makeCell(3, 2, 10, 4), // Kai x Dance — failed
  makeCell(4, 2, 20, 2), // Kai x Idle — queued
];

describe("MatrixGrid", () => {
  it("renders avatar names as row headers", () => {
    renderWithProviders(
      <MatrixGrid
        cells={cells}
        avatars={avatars}
        columns={columns}
      />,
    );

    expect(screen.getByText("Luna")).toBeInTheDocument();
    expect(screen.getByText("Kai")).toBeInTheDocument();
  });

  it("renders scene type names as column headers", () => {
    renderWithProviders(
      <MatrixGrid
        cells={cells}
        avatars={avatars}
        columns={columns}
      />,
    );

    expect(screen.getByText("Dance")).toBeInTheDocument();
    expect(screen.getByText("Idle")).toBeInTheDocument();
  });

  it("renders the correct number of cells", () => {
    renderWithProviders(
      <MatrixGrid
        cells={cells}
        avatars={avatars}
        columns={columns}
      />,
    );

    expect(screen.getByTestId("matrix-cell-1")).toBeInTheDocument();
    expect(screen.getByTestId("matrix-cell-2")).toBeInTheDocument();
    expect(screen.getByTestId("matrix-cell-3")).toBeInTheDocument();
    expect(screen.getByTestId("matrix-cell-4")).toBeInTheDocument();
  });

  it("shows status badges for each cell", () => {
    renderWithProviders(
      <MatrixGrid
        cells={cells}
        avatars={avatars}
        columns={columns}
      />,
    );

    expect(screen.getByText("Not Started")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });

  it("renders checkboxes when onToggleCell is provided", () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <MatrixGrid
        cells={cells}
        avatars={avatars}
        columns={columns}
        onToggleCell={onToggle}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(4);
  });

  it("renders the grid container", () => {
    renderWithProviders(
      <MatrixGrid
        cells={cells}
        avatars={avatars}
        columns={columns}
      />,
    );

    expect(screen.getByTestId("matrix-grid")).toBeInTheDocument();
  });
});
