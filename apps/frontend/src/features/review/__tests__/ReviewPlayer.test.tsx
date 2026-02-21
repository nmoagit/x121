/**
 * Tests for ReviewPlayer component (PRD-35).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ReviewPlayer } from "../ReviewPlayer";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ReviewPlayer", () => {
  const defaultProps = {
    segmentId: 42,
    segmentVersion: 1,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onFlag: vi.fn(),
  };

  test("renders the review player with segment info", () => {
    renderWithProviders(<ReviewPlayer {...defaultProps} />);

    expect(screen.getByTestId("review-player")).toBeInTheDocument();
    expect(screen.getByText(/Segment #42/)).toBeInTheDocument();
  });

  test("renders approve, reject, and flag buttons", () => {
    renderWithProviders(<ReviewPlayer {...defaultProps} />);

    expect(
      screen.getByRole("button", { name: /approve segment 42/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reject segment 42/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /flag segment 42/i }),
    ).toBeInTheDocument();
  });

  test("shows keyboard shortcut hints", () => {
    renderWithProviders(<ReviewPlayer {...defaultProps} />);

    expect(screen.getByText("Enter = Approve")).toBeInTheDocument();
    expect(screen.getByText("Backspace = Reject")).toBeInTheDocument();
    expect(screen.getByText("F = Flag")).toBeInTheDocument();
  });

  test("calls onApprove when approve button is clicked", () => {
    const onApprove = vi.fn();
    renderWithProviders(
      <ReviewPlayer {...defaultProps} onApprove={onApprove} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /approve segment 42/i }),
    );

    expect(onApprove).toHaveBeenCalledOnce();
  });

  test("calls onReject when reject button is clicked", () => {
    const onReject = vi.fn();
    renderWithProviders(
      <ReviewPlayer {...defaultProps} onReject={onReject} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /reject segment 42/i }),
    );

    expect(onReject).toHaveBeenCalledOnce();
  });

  test("calls onFlag when flag button is clicked", () => {
    const onFlag = vi.fn();
    renderWithProviders(<ReviewPlayer {...defaultProps} onFlag={onFlag} />);

    fireEvent.click(
      screen.getByRole("button", { name: /flag segment 42/i }),
    );

    expect(onFlag).toHaveBeenCalledOnce();
  });

  test("disables buttons when disabled prop is true", () => {
    renderWithProviders(<ReviewPlayer {...defaultProps} disabled />);

    const approveBtn = screen.getByRole("button", {
      name: /approve segment 42/i,
    });
    const rejectBtn = screen.getByRole("button", {
      name: /reject segment 42/i,
    });
    const flagBtn = screen.getByRole("button", {
      name: /flag segment 42/i,
    });

    expect(approveBtn).toBeDisabled();
    expect(rejectBtn).toBeDisabled();
    expect(flagBtn).toBeDisabled();
  });

  test("does not call handlers when disabled", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onFlag = vi.fn();

    renderWithProviders(
      <ReviewPlayer
        {...defaultProps}
        onApprove={onApprove}
        onReject={onReject}
        onFlag={onFlag}
        disabled
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /approve segment 42/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /reject segment 42/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /flag segment 42/i }),
    );

    expect(onApprove).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
    expect(onFlag).not.toHaveBeenCalled();
  });
});
