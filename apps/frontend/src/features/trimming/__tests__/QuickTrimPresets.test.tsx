import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { QuickTrimPresets } from "../QuickTrimPresets";
import { TRIM_PRESETS } from "../types";

describe("QuickTrimPresets", () => {
  const defaultProps = {
    segmentId: 1,
    totalFrames: 100,
    onApply: vi.fn(),
  };

  it("renders the preset container", () => {
    renderWithProviders(<QuickTrimPresets {...defaultProps} />);
    expect(
      screen.getByTestId("quick-trim-presets-1"),
    ).toBeInTheDocument();
  });

  it("renders all preset buttons", () => {
    renderWithProviders(<QuickTrimPresets {...defaultProps} />);
    for (const preset of TRIM_PRESETS) {
      expect(
        screen.getByTestId(`preset-${preset.value}`),
      ).toBeInTheDocument();
    }
  });

  it("disables presets that exceed available frames", () => {
    renderWithProviders(
      <QuickTrimPresets {...defaultProps} totalFrames={2} />,
    );

    // All presets require >= 3 frames, so all should be disabled with 2 frames
    expect(screen.getByTestId("preset-first_3")).toBeDisabled();
    expect(screen.getByTestId("preset-first_5")).toBeDisabled();
    expect(screen.getByTestId("preset-first_10")).toBeDisabled();
    expect(screen.getByTestId("preset-last_3")).toBeDisabled();
    expect(screen.getByTestId("preset-last_5")).toBeDisabled();
    expect(screen.getByTestId("preset-last_10")).toBeDisabled();
  });

  it("enables presets within available frame count", () => {
    renderWithProviders(
      <QuickTrimPresets {...defaultProps} totalFrames={5} />,
    );

    // 3 and 5 frame presets should be enabled; 10 disabled
    expect(screen.getByTestId("preset-first_3")).not.toBeDisabled();
    expect(screen.getByTestId("preset-first_5")).not.toBeDisabled();
    expect(screen.getByTestId("preset-first_10")).toBeDisabled();
  });

  it("calls onApply with correct first_5 preset values", () => {
    const onApply = vi.fn();
    renderWithProviders(
      <QuickTrimPresets {...defaultProps} onApply={onApply} />,
    );

    fireEvent.click(screen.getByTestId("preset-first_5"));
    expect(onApply).toHaveBeenCalledWith(0, 5);
  });

  it("calls onApply with correct last_5 preset values", () => {
    const onApply = vi.fn();
    renderWithProviders(
      <QuickTrimPresets {...defaultProps} onApply={onApply} />,
    );

    fireEvent.click(screen.getByTestId("preset-last_5"));
    expect(onApply).toHaveBeenCalledWith(95, 100);
  });

  it("shows frame count for enabled presets", () => {
    renderWithProviders(<QuickTrimPresets {...defaultProps} />);
    expect(screen.getByTestId("preset-first_3")).toHaveTextContent(
      "3 frames kept",
    );
  });

  it("shows 'Not enough frames' for disabled presets", () => {
    renderWithProviders(
      <QuickTrimPresets {...defaultProps} totalFrames={2} />,
    );
    expect(screen.getByTestId("preset-first_3")).toHaveTextContent(
      "Not enough frames",
    );
  });
});
