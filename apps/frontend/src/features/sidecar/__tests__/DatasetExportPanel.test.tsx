/**
 * Tests for DatasetExportPanel component (PRD-40).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { DatasetExportPanel } from "../DatasetExportPanel";
import type { DatasetExport } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockExports: DatasetExport[] = [
  {
    id: 1,
    project_id: 10,
    name: "Training Set v1",
    config_json: {
      quality_threshold: 80,
      train_split: 70,
      validation_split: 20,
      test_split: 10,
    },
    manifest_json: null,
    file_path: "/exports/1.zip",
    file_size_bytes: 1_073_741_824,
    sample_count: 5000,
    status_id: 3, // completed
    exported_by: 1,
    created_at: "2026-02-20T10:00:00Z",
    updated_at: "2026-02-20T10:30:00Z",
  },
  {
    id: 2,
    project_id: 10,
    name: "Training Set v2",
    config_json: {
      quality_threshold: 90,
      train_split: 80,
      validation_split: 10,
      test_split: 10,
    },
    manifest_json: null,
    file_path: null,
    file_size_bytes: null,
    sample_count: null,
    status_id: 1, // pending
    exported_by: 1,
    created_at: "2026-02-28T12:00:00Z",
    updated_at: "2026-02-28T12:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

let mockData: DatasetExport[] | undefined;
let mockLoading = false;
const mockCreateMutate = vi.fn();

vi.mock("../hooks/use-sidecar", () => ({
  useDatasetExports: () => ({
    data: mockData,
    isLoading: mockLoading,
  }),
  useCreateDatasetExport: () => ({
    mutate: mockCreateMutate,
    isPending: false,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("DatasetExportPanel", () => {
  test("renders export list", () => {
    mockData = mockExports;
    mockLoading = false;

    renderWithProviders(<DatasetExportPanel projectId={10} />);

    expect(screen.getByTestId("dataset-export-panel")).toBeInTheDocument();
    expect(screen.getByTestId("export-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("export-row-2")).toBeInTheDocument();
  });

  test("shows status badges", () => {
    mockData = mockExports;
    mockLoading = false;

    renderWithProviders(<DatasetExportPanel projectId={10} />);

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  test("shows create form when button clicked", () => {
    mockData = [];
    mockLoading = false;

    renderWithProviders(<DatasetExportPanel projectId={10} />);

    const addBtn = screen.getByTestId("add-export-btn");
    fireEvent.click(addBtn);

    expect(screen.getByTestId("create-export-form")).toBeInTheDocument();
  });

  test("shows download link for completed exports", () => {
    mockData = mockExports;
    mockLoading = false;

    renderWithProviders(<DatasetExportPanel projectId={10} />);

    // Completed export should have download link.
    const downloadLink = screen.getByTestId("download-export-1");
    expect(downloadLink).toBeInTheDocument();
    expect(downloadLink).toHaveAttribute(
      "href",
      expect.stringContaining("/dataset-exports/1/download"),
    );

    // Pending export should NOT have a download link.
    expect(screen.queryByTestId("download-export-2")).not.toBeInTheDocument();
  });
});
