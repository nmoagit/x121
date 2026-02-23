import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { BatchTrim } from "../BatchTrim";

describe("BatchTrim", () => {
  const defaultProps = {
    segmentIds: [1, 2, 3],
    onComplete: vi.fn(),
    onSubmit: vi.fn(),
  };

  it("renders the batch trim form", () => {
    renderWithProviders(<BatchTrim {...defaultProps} />);
    expect(screen.getByTestId("batch-trim-form")).toBeInTheDocument();
  });

  it("displays correct segment count", () => {
    renderWithProviders(<BatchTrim {...defaultProps} />);
    expect(screen.getByTestId("segment-count")).toHaveTextContent(
      "3 segments selected",
    );
  });

  it("displays singular when one segment selected", () => {
    renderWithProviders(
      <BatchTrim {...defaultProps} segmentIds={[1]} />,
    );
    expect(screen.getByTestId("segment-count")).toHaveTextContent(
      "1 segment selected",
    );
  });

  it("shows apply button", () => {
    renderWithProviders(<BatchTrim {...defaultProps} />);
    expect(screen.getByTestId("batch-apply")).toBeInTheDocument();
  });

  it("disables apply when out frame is zero", () => {
    renderWithProviders(<BatchTrim {...defaultProps} />);
    expect(screen.getByTestId("batch-apply")).toBeDisabled();
  });

  it("shows confirmation step before applying", () => {
    renderWithProviders(<BatchTrim {...defaultProps} />);

    // Set valid frame values
    fireEvent.change(screen.getByTestId("batch-in-frame"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByTestId("batch-out-frame"), {
      target: { value: "50" },
    });

    // Click apply to enter confirmation
    fireEvent.click(screen.getByTestId("batch-apply"));
    expect(screen.getByTestId("confirm-step")).toBeInTheDocument();
  });

  it("calls onComplete after confirmation", () => {
    const onComplete = vi.fn();
    const onSubmit = vi.fn();
    renderWithProviders(
      <BatchTrim
        {...defaultProps}
        onComplete={onComplete}
        onSubmit={onSubmit}
      />,
    );

    // Set valid frame values
    fireEvent.change(screen.getByTestId("batch-in-frame"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByTestId("batch-out-frame"), {
      target: { value: "50" },
    });

    // Apply and confirm
    fireEvent.click(screen.getByTestId("batch-apply"));
    fireEvent.click(screen.getByTestId("confirm-apply"));

    expect(onSubmit).toHaveBeenCalledWith([1, 2, 3], 0, 50);
    expect(onComplete).toHaveBeenCalled();
  });

  it("cancels confirmation step", () => {
    renderWithProviders(<BatchTrim {...defaultProps} />);

    fireEvent.change(screen.getByTestId("batch-out-frame"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByTestId("batch-apply"));
    fireEvent.click(screen.getByTestId("confirm-cancel"));

    expect(
      screen.queryByTestId("confirm-step"),
    ).not.toBeInTheDocument();
  });
});
