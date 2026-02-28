/**
 * Integration test for StorageVisualizerPage (PRD-19).
 */

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";
import { StorageVisualizerPage } from "../StorageVisualizerPage";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-storage-visualizer", () => ({
  useTreemapData: () => ({
    data: {
      name: "root",
      entity_type: "root",
      entity_id: 0,
      size: 1024,
      file_count: 5,
      reclaimable_bytes: 0,
      children: [
        {
          name: "Demo Project",
          entity_type: "project",
          entity_id: 1,
          size: 1024,
          file_count: 5,
          reclaimable_bytes: 0,
          children: [],
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
  useBreakdown: () => ({
    data: [
      { category: "video", total_bytes: 500, file_count: 3, percentage: 0.5 },
      { category: "image", total_bytes: 500, file_count: 2, percentage: 0.5 },
    ],
    isLoading: false,
    error: null,
  }),
  useStorageSummary: () => ({
    data: {
      total_bytes: 1048576,
      total_files: 100,
      reclaimable_bytes: 262144,
      reclaimable_percentage: 0.25,
      entity_count: 42,
      snapshot_at: "2026-02-28T12:00:00Z",
    },
    isLoading: false,
    error: null,
  }),
  useRefreshSnapshots: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("StorageVisualizerPage", () => {
  it("renders page heading", () => {
    renderWithProviders(<StorageVisualizerPage />);
    expect(screen.getByText("Storage Visualizer")).toBeInTheDocument();
  });

  it("renders summary section with Storage Overview", () => {
    renderWithProviders(<StorageVisualizerPage />);
    expect(screen.getByText("Storage Overview")).toBeInTheDocument();
  });

  it("renders stat badges with formatted values", () => {
    renderWithProviders(<StorageVisualizerPage />);
    expect(screen.getByText("Total Size")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Reclaimable")).toBeInTheDocument();
    expect(screen.getByText("Reclaimable %")).toBeInTheDocument();
  });

  it("renders the treemap section", () => {
    renderWithProviders(<StorageVisualizerPage />);
    expect(screen.getByText("Storage Treemap")).toBeInTheDocument();
  });

  it("renders the breakdown chart section", () => {
    renderWithProviders(<StorageVisualizerPage />);
    expect(screen.getByText("File Type Breakdown")).toBeInTheDocument();
  });

  it("renders the refresh button", () => {
    renderWithProviders(<StorageVisualizerPage />);
    expect(screen.getByText("Refresh")).toBeInTheDocument();
  });
});
