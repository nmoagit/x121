/**
 * Tests for ScheduleManager component (PRD-81).
 */

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ScheduleManager } from "../ScheduleManager";
import type { BackupSchedule } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const sampleSchedules: BackupSchedule[] = [
  {
    id: 1,
    backup_type: "full",
    cron_expression: "0 2 * * *",
    destination: "s3://backups/full",
    retention_days: 30,
    enabled: true,
    last_run_at: "2026-02-27T02:00:00Z",
    next_run_at: "2026-02-28T02:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-02-27T02:00:00Z",
  },
  {
    id: 2,
    backup_type: "incremental",
    cron_expression: "0 */6 * * *",
    destination: "s3://backups/incremental",
    retention_days: 7,
    enabled: false,
    last_run_at: null,
    next_run_at: null,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-01-15T00:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(() => Promise.resolve(sampleSchedules)),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve(undefined)),
  },
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ScheduleManager", () => {
  test("renders schedule manager container", () => {
    renderWithProviders(<ScheduleManager />);

    expect(screen.getByTestId("schedule-manager")).toBeInTheDocument();
  });

  test("renders section title", () => {
    renderWithProviders(<ScheduleManager />);

    expect(screen.getByText("Backup Schedules")).toBeInTheDocument();
  });

  test("renders create schedule button", () => {
    renderWithProviders(<ScheduleManager />);

    expect(screen.getByTestId("create-schedule-btn")).toBeInTheDocument();
  });

  test("renders schedule rows after loading", async () => {
    renderWithProviders(<ScheduleManager />);

    await waitFor(() => {
      expect(screen.getByTestId("schedule-list")).toBeInTheDocument();
    });

    expect(screen.getByTestId("schedule-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("schedule-row-2")).toBeInTheDocument();
  });

  test("displays cron expressions", async () => {
    renderWithProviders(<ScheduleManager />);

    await waitFor(() => {
      expect(screen.getByTestId("schedule-list")).toBeInTheDocument();
    });

    expect(screen.getByText("0 2 * * *")).toBeInTheDocument();
    expect(screen.getByText("0 */6 * * *")).toBeInTheDocument();
  });

  test("displays retention days", async () => {
    renderWithProviders(<ScheduleManager />);

    await waitFor(() => {
      expect(screen.getByTestId("schedule-list")).toBeInTheDocument();
    });

    expect(screen.getByText("30d")).toBeInTheDocument();
    expect(screen.getByText("7d")).toBeInTheDocument();
  });

  test("opens create form on button click", () => {
    renderWithProviders(<ScheduleManager />);

    fireEvent.click(screen.getByTestId("create-schedule-btn"));

    expect(screen.getByText("Create Schedule", { selector: "h2" })).toBeInTheDocument();
  });

  test("displays backup type badges", async () => {
    renderWithProviders(<ScheduleManager />);

    await waitFor(() => {
      expect(screen.getByTestId("schedule-list")).toBeInTheDocument();
    });

    expect(screen.getByText("Full")).toBeInTheDocument();
    expect(screen.getByText("Incremental")).toBeInTheDocument();
  });
});
