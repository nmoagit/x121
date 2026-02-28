/**
 * Tests for BackupDashboard component (PRD-81).
 */

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { BackupDashboard } from "../BackupDashboard";
import type { BackupSummary } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const mockSummary: BackupSummary = {
  total_count: 12,
  total_size_bytes: 5_368_709_120,
  last_full_at: "2026-02-27T02:00:00Z",
  last_verified_at: "2026-02-26T14:00:00Z",
  next_scheduled_at: "2026-02-28T02:00:00Z",
};

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn((path: string) => {
      if (path === "/admin/backups/summary") return Promise.resolve(mockSummary);
      if (path.startsWith("/admin/backups")) return Promise.resolve([]);
      if (path.startsWith("/admin/backup-schedules")) return Promise.resolve([]);
      return Promise.resolve(null);
    }),
    post: vi.fn(() => Promise.resolve({})),
    raw: vi.fn(() => Promise.resolve(new Response("runbook"))),
  },
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("BackupDashboard", () => {
  test("renders the page title", () => {
    renderWithProviders(<BackupDashboard />);

    expect(screen.getByText("Backup & Recovery")).toBeInTheDocument();
  });

  test("renders trigger backup button", () => {
    renderWithProviders(<BackupDashboard />);

    expect(screen.getByTestId("trigger-backup-btn")).toBeInTheDocument();
  });

  test("renders runbook download button", () => {
    renderWithProviders(<BackupDashboard />);

    expect(screen.getByTestId("runbook-download")).toBeInTheDocument();
  });

  test("renders summary stat cards after loading", async () => {
    renderWithProviders(<BackupDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("backup-summary")).toBeInTheDocument();
    });

    expect(screen.getByTestId("stat-total-count")).toHaveTextContent("12");
    expect(screen.getByTestId("stat-total-size")).toHaveTextContent("5.00 GB");
  });

  test("renders PRD badge", () => {
    renderWithProviders(<BackupDashboard />);

    expect(screen.getByText("PRD-81")).toBeInTheDocument();
  });

  test("opens trigger dialog on button click", () => {
    renderWithProviders(<BackupDashboard />);

    fireEvent.click(screen.getByTestId("trigger-backup-btn"));

    expect(screen.getByText("Trigger Backup", { selector: "h2" })).toBeInTheDocument();
  });

  test("shows backup list section", () => {
    renderWithProviders(<BackupDashboard />);

    expect(screen.getByText("Backups")).toBeInTheDocument();
  });

  test("shows schedule manager section", async () => {
    renderWithProviders(<BackupDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("schedule-manager")).toBeInTheDocument();
    });
  });
});
