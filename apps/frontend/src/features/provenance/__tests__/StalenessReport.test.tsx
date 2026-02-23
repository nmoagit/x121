import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { StalenessReport } from "../StalenessReport";
import type { StalenessReportEntry } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeEntry = (
  overrides: Partial<StalenessReportEntry> = {},
): StalenessReportEntry => ({
  segment_id: 10,
  scene_id: 5,
  receipt_id: 1,
  model_version: "1.0",
  current_model_version: "2.0",
  ...overrides,
});

// Mock the hook at the module level.
const mockUseStalenessReport = vi.fn();

vi.mock("../hooks/use-provenance", () => ({
  useStalenessReport: (...args: unknown[]) => mockUseStalenessReport(...args),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("StalenessReport", () => {
  it("renders stale segment entries with version mismatch details", () => {
    const entries = [
      makeEntry({ receipt_id: 1, segment_id: 10, model_version: "1.0", current_model_version: "2.0" }),
      makeEntry({ receipt_id: 2, segment_id: 20, model_version: "1.5", current_model_version: "3.0" }),
    ];
    mockUseStalenessReport.mockReturnValue({
      data: entries,
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<StalenessReport />);

    expect(screen.getByTestId("stale-entry-1")).toBeInTheDocument();
    expect(screen.getByTestId("stale-entry-2")).toBeInTheDocument();
    expect(screen.getByText("2 stale")).toBeInTheDocument();
  });

  it("shows empty state when no stale segments", () => {
    mockUseStalenessReport.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<StalenessReport />);

    expect(screen.getByTestId("staleness-empty")).toBeInTheDocument();
    expect(
      screen.getByText("No stale segments found. All receipts are up to date."),
    ).toBeInTheDocument();
  });

  it("shows loading spinner while fetching", () => {
    mockUseStalenessReport.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderWithProviders(<StalenessReport />);

    expect(screen.getByTestId("staleness-loading")).toBeInTheDocument();
  });

  it("shows error state on fetch failure", () => {
    mockUseStalenessReport.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderWithProviders(<StalenessReport />);

    expect(screen.getByTestId("staleness-error")).toBeInTheDocument();
  });

  it("shows 'removed' when current_model_version is null", () => {
    const entries = [
      makeEntry({ receipt_id: 3, current_model_version: null }),
    ];
    mockUseStalenessReport.mockReturnValue({
      data: entries,
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<StalenessReport />);

    expect(screen.getByText("removed")).toBeInTheDocument();
  });
});
