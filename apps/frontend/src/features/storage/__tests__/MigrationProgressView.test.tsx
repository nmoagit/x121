import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { MigrationProgressView } from "../MigrationProgressView";

import type { StorageMigration } from "../types";

const baseMigration: StorageMigration = {
  id: 42,
  status_id: 2, // in_progress
  source_backend_id: 1,
  target_backend_id: 2,
  total_files: 100,
  transferred_files: 50,
  verified_files: 45,
  failed_files: 2,
  total_bytes: 1073741824, // 1 GB
  transferred_bytes: 536870912, // 512 MB
  error_log: ["file_a.png: checksum mismatch", "file_b.png: timeout"],
  started_at: "2026-02-22T10:00:00Z",
  completed_at: null,
  initiated_by: 1,
  created_at: "2026-02-22T10:00:00Z",
  updated_at: "2026-02-22T10:05:00Z",
};

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
  },
}));

describe("MigrationProgressView", () => {
  it("renders migration progress percentage", () => {
    renderWithProviders(<MigrationProgressView migration={baseMigration} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("50 / 100 files")).toBeInTheDocument();
  });

  it("shows error count when errors exist", () => {
    renderWithProviders(<MigrationProgressView migration={baseMigration} />);
    expect(screen.getByText("Errors (2)")).toBeInTheDocument();
  });

  it("shows rollback button for in-progress migration", () => {
    const onRollback = vi.fn();
    renderWithProviders(
      <MigrationProgressView migration={baseMigration} onRollback={onRollback} />,
    );
    expect(screen.getByText("Rollback Migration")).toBeInTheDocument();
  });
});
