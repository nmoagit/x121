import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { VersionHistory } from "../VersionHistory";
import type { AssetUsageEntry } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeEntry = (
  overrides: Partial<AssetUsageEntry> = {},
): AssetUsageEntry => ({
  segment_id: 10,
  scene_id: 5,
  model_version: "1.0",
  created_at: "2026-02-23T10:00:00Z",
  ...overrides,
});

// Mock the hook at the module level.
const mockUseAssetUsage = vi.fn();

vi.mock("../hooks/use-provenance", () => ({
  useAssetUsage: (...args: unknown[]) => mockUseAssetUsage(...args),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("VersionHistory", () => {
  it("renders usage timeline with entries", () => {
    const entries = [
      makeEntry({ segment_id: 10, created_at: "2026-02-23T10:00:00Z" }),
      makeEntry({ segment_id: 20, created_at: "2026-02-22T09:00:00Z" }),
    ];
    mockUseAssetUsage.mockReturnValue({
      data: entries,
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<VersionHistory assetId={42} />);

    expect(screen.getByTestId("usage-entry-10")).toBeInTheDocument();
    expect(screen.getByTestId("usage-entry-20")).toBeInTheDocument();
    expect(screen.getByText("Asset Usage History (2)")).toBeInTheDocument();
  });

  it("shows empty state when no usage entries", () => {
    mockUseAssetUsage.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<VersionHistory assetId={42} />);

    expect(screen.getByTestId("usage-empty")).toBeInTheDocument();
    expect(
      screen.getByText("No segments have used this asset yet."),
    ).toBeInTheDocument();
  });

  it("shows loading spinner while fetching", () => {
    mockUseAssetUsage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderWithProviders(<VersionHistory assetId={42} />);

    expect(screen.getByTestId("usage-loading")).toBeInTheDocument();
  });

  it("shows error state on fetch failure", () => {
    mockUseAssetUsage.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderWithProviders(<VersionHistory assetId={42} />);

    expect(screen.getByTestId("usage-error")).toBeInTheDocument();
  });

  it("displays segment and scene context for each entry", () => {
    const entries = [
      makeEntry({ segment_id: 15, scene_id: 8 }),
    ];
    mockUseAssetUsage.mockReturnValue({
      data: entries,
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<VersionHistory assetId={42} />);

    expect(screen.getByText("Segment #15")).toBeInTheDocument();
    expect(screen.getByText("Scene #8")).toBeInTheDocument();
  });

  it("shows model version for each entry", () => {
    const entries = [
      makeEntry({ segment_id: 10, model_version: "2.5" }),
    ];
    mockUseAssetUsage.mockReturnValue({
      data: entries,
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<VersionHistory assetId={42} />);

    expect(screen.getByText("v2.5")).toBeInTheDocument();
  });
});
