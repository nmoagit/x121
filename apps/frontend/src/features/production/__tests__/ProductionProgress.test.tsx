import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ProductionProgress } from "../ProductionProgress";
import type { ProductionRunProgress } from "../types";

const progress: ProductionRunProgress = {
  run_id: 1,
  total_cells: 20,
  completed_cells: 12,
  failed_cells: 3,
  in_progress_cells: 4,
  not_started_cells: 1,
  completion_pct: 60.0,
};

describe("ProductionProgress", () => {
  it("renders the progress container", () => {
    renderWithProviders(<ProductionProgress progress={progress} />);

    expect(screen.getByTestId("production-progress")).toBeInTheDocument();
  });

  it("displays total cell count", () => {
    renderWithProviders(<ProductionProgress progress={progress} />);

    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("displays completed cell count", () => {
    renderWithProviders(<ProductionProgress progress={progress} />);

    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("displays failed cell count", () => {
    renderWithProviders(<ProductionProgress progress={progress} />);

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("displays stat labels", () => {
    renderWithProviders(<ProductionProgress progress={progress} />);

    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Not Started")).toBeInTheDocument();
  });

  it("shows completion percentage", () => {
    renderWithProviders(<ProductionProgress progress={progress} />);

    expect(screen.getByText("60.0%")).toBeInTheDocument();
  });

  it("renders the progress bar fill", () => {
    renderWithProviders(<ProductionProgress progress={progress} />);

    const fill = screen.getByTestId("progress-bar-fill");
    expect(fill).toBeInTheDocument();
    expect(fill.style.width).toBe("60%");
  });

  it("shows estimated remaining when cells are in progress", () => {
    renderWithProviders(<ProductionProgress progress={progress} />);

    expect(screen.getByText(/Estimated remaining/)).toBeInTheDocument();
  });

  it("does not show estimated remaining when no cells are in progress", () => {
    const doneProgress: ProductionRunProgress = {
      ...progress,
      in_progress_cells: 0,
    };
    renderWithProviders(<ProductionProgress progress={doneProgress} />);

    expect(screen.queryByText(/Estimated remaining/)).not.toBeInTheDocument();
  });
});
