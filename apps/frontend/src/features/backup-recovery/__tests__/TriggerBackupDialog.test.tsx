/**
 * Tests for TriggerBackupDialog component (PRD-81).
 */

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";
import { api } from "@/lib/api";

import { TriggerBackupDialog } from "../TriggerBackupDialog";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(() => Promise.resolve([])),
    post: vi.fn(() => Promise.resolve({ id: 99, status: "pending" })),
  },
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("TriggerBackupDialog", () => {
  const defaultProps = { open: true, onClose: vi.fn() };

  test("renders form when open", () => {
    renderWithProviders(<TriggerBackupDialog {...defaultProps} />);

    expect(screen.getByTestId("trigger-backup-form")).toBeInTheDocument();
  });

  test("renders nothing when closed", () => {
    renderWithProviders(<TriggerBackupDialog open={false} onClose={vi.fn()} />);

    expect(screen.queryByTestId("trigger-backup-form")).not.toBeInTheDocument();
  });

  test("renders modal title", () => {
    renderWithProviders(<TriggerBackupDialog {...defaultProps} />);

    expect(screen.getByText("Trigger Backup", { selector: "h2" })).toBeInTheDocument();
  });

  test("renders backup type select", () => {
    renderWithProviders(<TriggerBackupDialog {...defaultProps} />);

    expect(screen.getByText("Backup Type")).toBeInTheDocument();
  });

  test("renders destination input with default value", () => {
    renderWithProviders(<TriggerBackupDialog {...defaultProps} />);

    const input = screen.getByDisplayValue("s3://backups");
    expect(input).toBeInTheDocument();
  });

  test("calls API on form submission", async () => {
    renderWithProviders(<TriggerBackupDialog {...defaultProps} />);

    const submitBtn = screen.getByText("Trigger Backup", { selector: "button" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/admin/backups",
        expect.objectContaining({
          backup_type: "full",
          destination: "s3://backups",
        }),
      );
    });
  });

  test("calls onClose after successful submission", async () => {
    const onClose = vi.fn();
    renderWithProviders(<TriggerBackupDialog open={true} onClose={onClose} />);

    const submitBtn = screen.getByText("Trigger Backup", { selector: "button" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  test("renders cancel button", () => {
    renderWithProviders(<TriggerBackupDialog {...defaultProps} />);

    expect(screen.getByText("Cancel", { selector: "button" })).toBeInTheDocument();
  });
});
