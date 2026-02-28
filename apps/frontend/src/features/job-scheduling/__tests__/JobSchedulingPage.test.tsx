/**
 * JobSchedulingPage integration tests (PRD-119).
 *
 * Validates the page renders with tabs, create button, and tab switching.
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { JobSchedulingPage } from "../JobSchedulingPage";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-job-scheduling", () => ({
  useSchedules: vi.fn(),
  useSchedule: vi.fn(),
  useCreateSchedule: vi.fn(),
  useUpdateSchedule: vi.fn(),
  useDeleteSchedule: vi.fn(),
  usePauseSchedule: vi.fn(),
  useResumeSchedule: vi.fn(),
  useScheduleHistory: vi.fn(),
  useOffPeakConfig: vi.fn(),
  useUpdateOffPeakConfig: vi.fn(),
}));

import {
  useSchedules,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  usePauseSchedule,
  useResumeSchedule,
  useScheduleHistory,
  useOffPeakConfig,
  useUpdateOffPeakConfig,
} from "../hooks/use-job-scheduling";

/* --------------------------------------------------------------------------
   Setup
   -------------------------------------------------------------------------- */

function setupMocks() {
  vi.mocked(useSchedules).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useSchedules>);

  vi.mocked(useCreateSchedule).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useCreateSchedule>);

  vi.mocked(useUpdateSchedule).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateSchedule>);

  vi.mocked(useOffPeakConfig).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useOffPeakConfig>);

  vi.mocked(useUpdateOffPeakConfig).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateOffPeakConfig>);

  // Sub-component hooks (used by ScheduleList rows)
  vi.mocked(usePauseSchedule).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof usePauseSchedule>);

  vi.mocked(useResumeSchedule).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useResumeSchedule>);

  vi.mocked(useDeleteSchedule).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteSchedule>);

  vi.mocked(useScheduleHistory).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useScheduleHistory>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("JobSchedulingPage", () => {
  it("renders the page with title and create button", () => {
    setupMocks();

    renderWithProviders(<JobSchedulingPage />);

    expect(screen.getByTestId("job-scheduling-page")).toBeInTheDocument();
    expect(screen.getByText("Job Scheduling")).toBeInTheDocument();
    expect(screen.getByTestId("create-schedule-btn")).toBeInTheDocument();
  });

  it("shows Schedules tab content by default", () => {
    setupMocks();

    renderWithProviders(<JobSchedulingPage />);

    // The schedules tab should be active (showing the empty schedule list)
    expect(screen.getByText(/no schedules configured/i)).toBeInTheDocument();
  });

  it("shows tabs for Schedules and Off-Peak Config", () => {
    setupMocks();

    renderWithProviders(<JobSchedulingPage />);

    expect(screen.getByRole("tab", { name: "Schedules" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Off-Peak Config" })).toBeInTheDocument();
  });

  it("switches to Off-Peak Config tab", () => {
    setupMocks();

    renderWithProviders(<JobSchedulingPage />);

    const offPeakTab = screen.getByRole("tab", { name: "Off-Peak Config" });
    fireEvent.click(offPeakTab);

    // Off-peak editor should now be visible
    expect(screen.getByTestId("offpeak-editor")).toBeInTheDocument();
  });

  it("hides create button on Off-Peak Config tab", () => {
    setupMocks();

    renderWithProviders(<JobSchedulingPage />);

    // Switch to off-peak tab
    const offPeakTab = screen.getByRole("tab", { name: "Off-Peak Config" });
    fireEvent.click(offPeakTab);

    expect(screen.queryByTestId("create-schedule-btn")).not.toBeInTheDocument();
  });

  it("opens create modal when New Schedule button is clicked", () => {
    setupMocks();

    renderWithProviders(<JobSchedulingPage />);

    const createBtn = screen.getByTestId("create-schedule-btn");
    fireEvent.click(createBtn);

    // Modal opens with form; "New Schedule" appears as both button text and modal title
    const matches = screen.getAllByText("New Schedule");
    expect(matches.length).toBeGreaterThanOrEqual(2); // button + modal title
    expect(screen.getByTestId("schedule-form")).toBeInTheDocument();
  });
});
