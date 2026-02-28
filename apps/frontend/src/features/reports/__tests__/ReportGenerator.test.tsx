/**
 * Tests for ReportGenerator component (PRD-73).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ReportGenerator } from "../ReportGenerator";
import type { ReportType } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockReportTypes: ReportType[] = [
  {
    id: 1,
    name: "Delivery Summary",
    description: "Summary of all deliveries",
    config_schema_json: null,
    created_at: "2026-02-28T10:00:00Z",
    updated_at: "2026-02-28T10:00:00Z",
  },
  {
    id: 2,
    name: "GPU Utilization",
    description: "GPU usage metrics",
    config_schema_json: null,
    created_at: "2026-02-28T10:00:00Z",
    updated_at: "2026-02-28T10:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

let mockTypesData: ReportType[] | undefined;
let mockTypesLoading = false;
const mockGenerateMutate = vi.fn();
let mockGeneratePending = false;

vi.mock("../hooks/use-reports", () => ({
  useReportTypes: () => ({
    data: mockTypesData,
    isLoading: mockTypesLoading,
  }),
  useGenerateReport: () => ({
    mutate: mockGenerateMutate,
    isPending: mockGeneratePending,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ReportGenerator", () => {
  test("renders report type options", () => {
    mockTypesData = mockReportTypes;
    mockTypesLoading = false;

    renderWithProviders(<ReportGenerator />);

    expect(screen.getByTestId("report-generator")).toBeInTheDocument();

    // The select should contain the report type options.
    const options = screen.getAllByRole("option");
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain("Delivery Summary");
    expect(labels).toContain("GPU Utilization");
  });

  test("submits generate request with correct params", () => {
    mockTypesData = mockReportTypes;
    mockTypesLoading = false;
    mockGeneratePending = false;
    mockGenerateMutate.mockClear();

    renderWithProviders(<ReportGenerator />);

    // Select report type.
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "1" } });

    // Fill in date range via labeled inputs.
    const dateFrom = screen.getByLabelText("Date From");
    const dateTo = screen.getByLabelText("Date To");
    fireEvent.change(dateFrom, { target: { value: "2026-01-01" } });
    fireEvent.change(dateTo, { target: { value: "2026-01-31" } });

    // Click generate.
    const generateBtn = screen.getByTestId("generate-btn");
    fireEvent.click(generateBtn);

    expect(mockGenerateMutate).toHaveBeenCalledWith({
      report_type_id: 1,
      config_json: { date_from: "2026-01-01", date_to: "2026-01-31" },
      format: "json",
    });
  });

  test("shows format selection", () => {
    mockTypesData = mockReportTypes;
    mockTypesLoading = false;

    renderWithProviders(<ReportGenerator />);

    const formatSelector = screen.getByTestId("format-selector");
    expect(formatSelector).toBeInTheDocument();

    expect(screen.getByLabelText("JSON")).toBeInTheDocument();
    expect(screen.getByLabelText("CSV")).toBeInTheDocument();
    expect(screen.getByLabelText("PDF")).toBeInTheDocument();
  });

  test("disables button during generation", () => {
    mockTypesData = mockReportTypes;
    mockTypesLoading = false;
    mockGeneratePending = true;

    renderWithProviders(<ReportGenerator />);

    const generateBtn = screen.getByTestId("generate-btn");
    expect(generateBtn).toBeDisabled();
  });
});
