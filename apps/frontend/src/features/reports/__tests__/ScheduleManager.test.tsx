/**
 * Tests for ScheduleManager component (PRD-73).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ScheduleManager } from "../ScheduleManager";
import type { ReportSchedule, ReportType } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockSchedules: ReportSchedule[] = [
  {
    id: 1,
    report_type_id: 1,
    config_json: { date_from: "2026-01-01", date_to: "2026-12-31" },
    format: "csv",
    schedule: "weekly",
    recipients_json: ["user@example.com"],
    enabled: true,
    last_run_at: "2026-02-21T00:00:00Z",
    next_run_at: "2026-02-28T00:00:00Z",
    created_by: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-02-21T00:00:00Z",
  },
  {
    id: 2,
    report_type_id: 2,
    config_json: { date_from: "2026-01-01", date_to: "2026-06-30" },
    format: "pdf",
    schedule: "monthly",
    recipients_json: ["admin@example.com"],
    enabled: false,
    last_run_at: null,
    next_run_at: null,
    created_by: 1,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  },
];

const mockReportTypes: ReportType[] = [
  {
    id: 1,
    name: "Delivery Summary",
    description: null,
    config_schema_json: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

let mockScheduleData: ReportSchedule[] | undefined;
let mockScheduleLoading = false;
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockCreateMutate = vi.fn();

vi.mock("../hooks/use-reports", () => ({
  useReportSchedules: () => ({
    data: mockScheduleData,
    isLoading: mockScheduleLoading,
  }),
  useReportTypes: () => ({
    data: mockReportTypes,
    isLoading: false,
  }),
  useUpdateSchedule: () => ({
    mutate: mockUpdateMutate,
    isPending: false,
  }),
  useDeleteSchedule: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
  useCreateSchedule: () => ({
    mutate: mockCreateMutate,
    isPending: false,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ScheduleManager", () => {
  test("renders schedule list", () => {
    mockScheduleData = mockSchedules;
    mockScheduleLoading = false;

    renderWithProviders(<ScheduleManager />);

    expect(screen.getByTestId("schedule-manager")).toBeInTheDocument();
    expect(screen.getByTestId("schedule-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("schedule-row-2")).toBeInTheDocument();
  });

  test("creates new schedule via form", () => {
    mockScheduleData = [];
    mockScheduleLoading = false;
    mockCreateMutate.mockClear();

    renderWithProviders(<ScheduleManager />);

    // Click "New Schedule" to open the form.
    const addBtn = screen.getByTestId("add-schedule-btn");
    fireEvent.click(addBtn);

    expect(screen.getByTestId("create-schedule-form")).toBeInTheDocument();
  });

  test("toggles enabled state", () => {
    mockScheduleData = mockSchedules;
    mockScheduleLoading = false;
    mockUpdateMutate.mockClear();

    renderWithProviders(<ScheduleManager />);

    // The first schedule is enabled; click its toggle.
    const toggleButtons = screen.getAllByRole("switch");
    const firstToggle = toggleButtons[0] as HTMLElement;
    fireEvent.click(firstToggle);

    expect(mockUpdateMutate).toHaveBeenCalledWith({
      id: 1,
      data: { enabled: false },
    });
  });

  test("deletes schedule", () => {
    mockScheduleData = mockSchedules;
    mockScheduleLoading = false;
    mockDeleteMutate.mockClear();

    renderWithProviders(<ScheduleManager />);

    const deleteBtn = screen.getByTestId("delete-schedule-1");
    fireEvent.click(deleteBtn);

    expect(mockDeleteMutate).toHaveBeenCalledWith(1);
  });
});
