/**
 * Tests for BackupList component (PRD-81).
 */

import { screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { BackupList } from "../BackupList";
import type { Backup } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const sampleBackups: Backup[] = [
  {
    id: 1,
    backup_type: "full",
    destination: "s3://backups/full-001",
    file_path: "/backups/full-001.tar.gz",
    size_bytes: 1_073_741_824,
    status: "completed",
    started_at: "2026-02-27T02:00:00Z",
    completed_at: "2026-02-27T02:30:00Z",
    verified: true,
    verified_at: "2026-02-27T03:00:00Z",
    verification_result_json: {
      backup_id: 1,
      success: true,
      restore_duration_secs: 45.2,
      queries_passed: 10,
      queries_total: 10,
      errors: [],
    },
    error_message: null,
    triggered_by: "schedule",
    retention_expires_at: "2026-03-29T02:00:00Z",
    created_at: "2026-02-27T02:00:00Z",
    updated_at: "2026-02-27T03:00:00Z",
  },
  {
    id: 2,
    backup_type: "incremental",
    destination: "s3://backups/inc-001",
    file_path: null,
    size_bytes: null,
    status: "failed",
    started_at: "2026-02-27T04:00:00Z",
    completed_at: null,
    verified: false,
    verified_at: null,
    verification_result_json: null,
    error_message: "Connection timeout",
    triggered_by: "manual",
    retention_expires_at: null,
    created_at: "2026-02-27T04:00:00Z",
    updated_at: "2026-02-27T04:05:00Z",
  },
  {
    id: 3,
    backup_type: "config",
    destination: "s3://backups/cfg-001",
    file_path: "/backups/cfg-001.tar.gz",
    size_bytes: 2_048,
    status: "running",
    started_at: "2026-02-28T01:00:00Z",
    completed_at: null,
    verified: false,
    verified_at: null,
    verification_result_json: null,
    error_message: null,
    triggered_by: "system",
    retention_expires_at: null,
    created_at: "2026-02-28T01:00:00Z",
    updated_at: "2026-02-28T01:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(() => Promise.resolve(sampleBackups)),
    post: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve(undefined)),
  },
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("BackupList", () => {
  test("renders loading state initially", () => {
    renderWithProviders(<BackupList />);

    expect(screen.getByTestId("backup-list-loading")).toBeInTheDocument();
  });

  test("renders backup rows after loading", async () => {
    renderWithProviders(<BackupList />);

    await waitFor(() => {
      expect(screen.getByTestId("backup-list")).toBeInTheDocument();
    });

    expect(screen.getByTestId("backup-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("backup-row-2")).toBeInTheDocument();
    expect(screen.getByTestId("backup-row-3")).toBeInTheDocument();
  });

  test("displays correct status badges", async () => {
    renderWithProviders(<BackupList />);

    await waitFor(() => {
      expect(screen.getByTestId("backup-list")).toBeInTheDocument();
    });

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  test("displays correct backup type badges", async () => {
    renderWithProviders(<BackupList />);

    await waitFor(() => {
      expect(screen.getByTestId("backup-list")).toBeInTheDocument();
    });

    expect(screen.getByText("Full")).toBeInTheDocument();
    expect(screen.getByText("Incremental")).toBeInTheDocument();
    expect(screen.getByText("Config")).toBeInTheDocument();
  });

  test("displays formatted size for backups with size data", async () => {
    renderWithProviders(<BackupList />);

    await waitFor(() => {
      expect(screen.getByTestId("backup-list")).toBeInTheDocument();
    });

    expect(screen.getByText("1.00 GB")).toBeInTheDocument();
    expect(screen.getByText("2.00 KB")).toBeInTheDocument();
  });

  test("displays dashes for backups without size data", async () => {
    renderWithProviders(<BackupList />);

    await waitFor(() => {
      expect(screen.getByTestId("backup-list")).toBeInTheDocument();
    });

    // Backup #2 has null size_bytes
    const dashes = screen.getAllByText("--");
    expect(dashes.length).toBeGreaterThan(0);
  });

  test("shows verify button only for completed non-verified backups", async () => {
    renderWithProviders(<BackupList />);

    await waitFor(() => {
      expect(screen.getByTestId("backup-list")).toBeInTheDocument();
    });

    // Backup #1 is completed + verified -> no verify button
    expect(screen.queryByTestId("backup-verify-1")).not.toBeInTheDocument();

    // Backup #2 is failed -> should not have verify button
    expect(screen.queryByTestId("backup-verify-2")).not.toBeInTheDocument();
  });

  test("renders table header columns", async () => {
    renderWithProviders(<BackupList />);

    await waitFor(() => {
      expect(screen.getByTestId("backup-list")).toBeInTheDocument();
    });

    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Size")).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });
});
