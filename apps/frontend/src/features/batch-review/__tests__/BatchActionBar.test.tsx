/**
 * Tests for BatchActionBar component (PRD-92).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { BatchActionBar } from "../BatchActionBar";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const mutateApprove = vi.fn();
const mutateReject = vi.fn();

vi.mock("../hooks/use-batch-review", () => ({
  useBatchApprove: vi.fn(),
  useBatchReject: vi.fn(),
}));

import { useBatchApprove, useBatchReject } from "../hooks/use-batch-review";

function setupMocks({
  approvePending = false,
  rejectPending = false,
}: {
  approvePending?: boolean;
  rejectPending?: boolean;
} = {}) {
  mutateApprove.mockClear();
  mutateReject.mockClear();

  vi.mocked(useBatchApprove).mockReturnValue({
    mutate: mutateApprove,
    isPending: approvePending,
    isSuccess: false,
    data: undefined,
  } as unknown as ReturnType<typeof useBatchApprove>);

  vi.mocked(useBatchReject).mockReturnValue({
    mutate: mutateReject,
    isPending: rejectPending,
    isSuccess: false,
    data: undefined,
  } as unknown as ReturnType<typeof useBatchReject>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("BatchActionBar", () => {
  const defaultProps = {
    selectedIds: [1, 2, 3],
    onClear: vi.fn(),
    projectId: 10,
  };

  it("renders the selection count", () => {
    setupMocks();
    renderWithProviders(<BatchActionBar {...defaultProps} />);

    expect(screen.getByText("3 segments selected")).toBeInTheDocument();
  });

  it("renders singular form for single selection", () => {
    setupMocks();
    renderWithProviders(<BatchActionBar {...defaultProps} selectedIds={[42]} />);

    expect(screen.getByText("1 segment selected")).toBeInTheDocument();
  });

  it("approve button calls useBatchApprove mutation", () => {
    setupMocks();
    renderWithProviders(<BatchActionBar {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /approve all/i }));

    expect(mutateApprove).toHaveBeenCalledWith({ segment_ids: [1, 2, 3] });
  });

  it("reject button shows reason input", () => {
    setupMocks();
    renderWithProviders(<BatchActionBar {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /reject all/i }));

    expect(screen.getByLabelText("Rejection reason")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm reject/i })).toBeInTheDocument();
  });

  it("clear button calls onClear", () => {
    setupMocks();
    const onClear = vi.fn();
    renderWithProviders(<BatchActionBar {...defaultProps} onClear={onClear} />);

    fireEvent.click(screen.getByRole("button", { name: /clear selection/i }));

    expect(onClear).toHaveBeenCalledOnce();
  });

  it("buttons are disabled when no selection", () => {
    setupMocks();
    renderWithProviders(<BatchActionBar {...defaultProps} selectedIds={[]} />);

    expect(screen.getByRole("button", { name: /approve all/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /reject all/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /clear selection/i })).toBeDisabled();
  });
});
