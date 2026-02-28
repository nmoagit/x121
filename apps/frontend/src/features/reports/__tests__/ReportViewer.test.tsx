/**
 * Tests for ReportViewer component (PRD-73).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ReportViewer } from "../ReportViewer";
import type { Report } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockReport: Report = {
  id: 1,
  report_type_id: 1,
  config_json: { date_from: "2026-01-01", date_to: "2026-01-31" },
  data_json: { deliveries: 42, characters: 10 },
  file_path: "/reports/1.csv",
  format: "csv",
  generated_by: 1,
  status_id: 3, // completed
  started_at: "2026-02-01T10:00:00Z",
  completed_at: "2026-02-01T10:05:00Z",
  created_at: "2026-02-01T10:00:00Z",
  updated_at: "2026-02-01T10:05:00Z",
};

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

let mockData: Report | undefined;
let mockLoading = false;

vi.mock("../hooks/use-reports", () => ({
  useReport: () => ({
    data: mockData,
    isLoading: mockLoading,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ReportViewer", () => {
  test("renders report metadata", () => {
    mockData = mockReport;
    mockLoading = false;

    renderWithProviders(<ReportViewer reportId={1} />);

    expect(screen.getByTestId("report-viewer")).toBeInTheDocument();
    expect(screen.getByText("Report #1")).toBeInTheDocument();
    expect(screen.getByText("CSV")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("2026-01-01 to 2026-01-31")).toBeInTheDocument();
  });

  test("shows download button for completed reports", () => {
    mockData = mockReport;
    mockLoading = false;

    renderWithProviders(<ReportViewer reportId={1} />);

    const downloadBtn = screen.getByTestId("download-btn");
    expect(downloadBtn).toBeInTheDocument();
    expect(downloadBtn).toHaveAttribute(
      "href",
      expect.stringContaining("/reports/1/download"),
    );
  });

  test("handles loading state", () => {
    mockData = undefined;
    mockLoading = true;

    renderWithProviders(<ReportViewer reportId={1} />);

    expect(screen.getByText("Loading report...")).toBeInTheDocument();
  });
});
