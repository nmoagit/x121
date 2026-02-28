/**
 * Tests for ReportList component (PRD-73).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ReportList } from "../ReportList";
import type { Report } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockReports: Report[] = [
  {
    id: 1,
    report_type_id: 1,
    config_json: { date_from: "2026-01-01", date_to: "2026-01-31" },
    data_json: { total: 100 },
    file_path: "/reports/1.csv",
    format: "csv",
    generated_by: 1,
    status_id: 3, // completed
    started_at: "2026-02-01T10:00:00Z",
    completed_at: "2026-02-01T10:05:00Z",
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-01T10:05:00Z",
  },
  {
    id: 2,
    report_type_id: 2,
    config_json: { date_from: "2026-02-01", date_to: "2026-02-28" },
    data_json: null,
    file_path: null,
    format: "json",
    generated_by: 1,
    status_id: 1, // pending
    started_at: null,
    completed_at: null,
    created_at: "2026-02-28T12:00:00Z",
    updated_at: "2026-02-28T12:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

let mockData: Report[] | undefined;
let mockLoading = false;

vi.mock("../hooks/use-reports", () => ({
  useReports: () => ({
    data: mockData,
    isLoading: mockLoading,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ReportList", () => {
  test("renders report rows", () => {
    mockData = mockReports;
    mockLoading = false;

    renderWithProviders(<ReportList />);

    expect(screen.getByTestId("report-list")).toBeInTheDocument();
    expect(screen.getByTestId("report-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("report-row-2")).toBeInTheDocument();
  });

  test("shows status badges", () => {
    mockData = mockReports;
    mockLoading = false;

    renderWithProviders(<ReportList />);

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  test("shows download link for completed reports", () => {
    mockData = mockReports;
    mockLoading = false;

    renderWithProviders(<ReportList />);

    // Completed report should have download link.
    const downloadLink = screen.getByTestId("download-link-1");
    expect(downloadLink).toBeInTheDocument();
    expect(downloadLink).toHaveAttribute(
      "href",
      expect.stringContaining("/reports/1/download"),
    );

    // Pending report should NOT have a download link.
    expect(screen.queryByTestId("download-link-2")).not.toBeInTheDocument();
  });
});
