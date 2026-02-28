/**
 * ScheduleList component tests (PRD-119).
 *
 * Validates rendering of schedule rows, action buttons, and empty/loading states.
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ScheduleList } from "../ScheduleList";
import type { Schedule } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-job-scheduling", () => ({
  useSchedules: vi.fn(),
  usePauseSchedule: vi.fn(),
  useResumeSchedule: vi.fn(),
  useDeleteSchedule: vi.fn(),
  useScheduleHistory: vi.fn(),
}));

import {
  useSchedules,
  usePauseSchedule,
  useResumeSchedule,
  useDeleteSchedule,
  useScheduleHistory,
} from "../hooks/use-job-scheduling";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const MOCK_SCHEDULE: Schedule = {
  id: 1,
  name: "Daily Render",
  description: "Runs every night",
  schedule_type: "recurring",
  cron_expression: "0 2 * * *",
  scheduled_at: null,
  timezone: "UTC",
  is_off_peak_only: false,
  action_type: "submit_job",
  action_config: { workflow_id: 1 },
  owner_id: 10,
  is_active: true,
  last_run_at: "2026-02-27T02:00:00Z",
  next_run_at: "2026-02-28T02:00:00Z",
  run_count: 15,
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-27T02:00:00Z",
};

const MOCK_PAUSED_SCHEDULE: Schedule = {
  ...MOCK_SCHEDULE,
  id: 2,
  name: "Weekly Batch",
  is_active: false,
  run_count: 3,
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const pauseMutateFn = vi.fn();
const resumeMutateFn = vi.fn();
const deleteMutateFn = vi.fn();

function setupMocks(
  schedules?: Schedule[],
  isPending = false,
  isError = false,
) {
  vi.mocked(useSchedules).mockReturnValue({
    data: schedules,
    isPending,
    isError,
  } as ReturnType<typeof useSchedules>);

  pauseMutateFn.mockClear();
  vi.mocked(usePauseSchedule).mockReturnValue({
    mutate: pauseMutateFn,
    isPending: false,
  } as unknown as ReturnType<typeof usePauseSchedule>);

  resumeMutateFn.mockClear();
  vi.mocked(useResumeSchedule).mockReturnValue({
    mutate: resumeMutateFn,
    isPending: false,
  } as unknown as ReturnType<typeof useResumeSchedule>);

  deleteMutateFn.mockClear();
  vi.mocked(useDeleteSchedule).mockReturnValue({
    mutate: deleteMutateFn,
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteSchedule>);

  // History mock for expanded rows
  vi.mocked(useScheduleHistory).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useScheduleHistory>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ScheduleList", () => {
  const onEdit = vi.fn();

  it("renders loading state", () => {
    setupMocks(undefined, true);

    renderWithProviders(<ScheduleList onEdit={onEdit} />);

    expect(screen.getByTestId("schedule-list-loading")).toBeInTheDocument();
  });

  it("renders empty state when no schedules", () => {
    setupMocks([]);

    renderWithProviders(<ScheduleList onEdit={onEdit} />);

    expect(screen.getByTestId("schedule-list-empty")).toBeInTheDocument();
    expect(screen.getByText(/no schedules configured/i)).toBeInTheDocument();
  });

  it("renders schedule rows", () => {
    setupMocks([MOCK_SCHEDULE, MOCK_PAUSED_SCHEDULE]);

    renderWithProviders(<ScheduleList onEdit={onEdit} />);

    expect(screen.getByTestId("schedule-list")).toBeInTheDocument();
    expect(screen.getByText("Daily Render")).toBeInTheDocument();
    expect(screen.getByText("Weekly Batch")).toBeInTheDocument();
  });

  it("shows Active badge for active schedule", () => {
    setupMocks([MOCK_SCHEDULE]);

    renderWithProviders(<ScheduleList onEdit={onEdit} />);

    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows Paused badge for inactive schedule", () => {
    setupMocks([MOCK_PAUSED_SCHEDULE]);

    renderWithProviders(<ScheduleList onEdit={onEdit} />);

    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("shows run count", () => {
    setupMocks([MOCK_SCHEDULE]);

    renderWithProviders(<ScheduleList onEdit={onEdit} />);

    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("shows cron expression for recurring schedules", () => {
    setupMocks([MOCK_SCHEDULE]);

    renderWithProviders(<ScheduleList onEdit={onEdit} />);

    expect(screen.getByText("0 2 * * *")).toBeInTheDocument();
  });

  it("pause button calls pauseMutation for active schedule", () => {
    setupMocks([MOCK_SCHEDULE]);

    renderWithProviders(<ScheduleList onEdit={onEdit} />);

    const pauseBtn = screen.getByTestId("schedule-toggle-1");
    fireEvent.click(pauseBtn);

    expect(pauseMutateFn).toHaveBeenCalledWith(1);
  });

  it("resume button calls resumeMutation for paused schedule", () => {
    setupMocks([MOCK_PAUSED_SCHEDULE]);

    renderWithProviders(<ScheduleList onEdit={onEdit} />);

    const resumeBtn = screen.getByTestId("schedule-toggle-2");
    fireEvent.click(resumeBtn);

    expect(resumeMutateFn).toHaveBeenCalledWith(2);
  });

  it("renders error state", () => {
    setupMocks(undefined, false, true);

    renderWithProviders(<ScheduleList onEdit={onEdit} />);

    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });
});
