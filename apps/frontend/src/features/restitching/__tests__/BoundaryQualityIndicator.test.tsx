/**
 * Tests for BoundaryQualityIndicator component (PRD-25).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { BoundaryQualityIndicator } from "../BoundaryQualityIndicator";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("BoundaryQualityIndicator", () => {
  test("renders empty message when no SSIM data", () => {
    renderWithProviders(
      <BoundaryQualityIndicator ssimBefore={null} ssimAfter={null} />,
    );
    expect(screen.getByText("No boundary SSIM data available.")).toBeInTheDocument();
  });

  test("renders before and after boundaries", () => {
    renderWithProviders(
      <BoundaryQualityIndicator ssimBefore={0.95} ssimAfter={0.70} />,
    );
    expect(screen.getByTestId("boundary-before")).toBeInTheDocument();
    expect(screen.getByTestId("boundary-after")).toBeInTheDocument();
  });

  test("shows numeric SSIM scores", () => {
    renderWithProviders(
      <BoundaryQualityIndicator ssimBefore={0.95} ssimAfter={0.70} />,
    );
    expect(screen.getByText("0.950")).toBeInTheDocument();
    expect(screen.getByText("0.700")).toBeInTheDocument();
  });

  test("classifies good quality above warning threshold", () => {
    renderWithProviders(
      <BoundaryQualityIndicator ssimBefore={0.95} ssimAfter={null} />,
    );
    expect(screen.getByText("good")).toBeInTheDocument();
  });

  test("classifies warning quality between thresholds", () => {
    renderWithProviders(
      <BoundaryQualityIndicator ssimBefore={0.88} ssimAfter={null} />,
    );
    expect(screen.getByText("warning")).toBeInTheDocument();
  });

  test("classifies discontinuity below threshold", () => {
    renderWithProviders(
      <BoundaryQualityIndicator ssimBefore={0.70} ssimAfter={null} />,
    );
    expect(screen.getByText("discontinuity")).toBeInTheDocument();
  });

  test("shows smooth button on discontinuity", () => {
    const onSmooth = vi.fn();
    renderWithProviders(
      <BoundaryQualityIndicator
        ssimBefore={0.70}
        ssimAfter={null}
        onRequestSmoothing={onSmooth}
      />,
    );
    const btn = screen.getByTestId("smooth-before-btn");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onSmooth).toHaveBeenCalledWith("before");
  });

  test("does not show smooth button when quality is good", () => {
    renderWithProviders(
      <BoundaryQualityIndicator
        ssimBefore={0.95}
        ssimAfter={null}
        onRequestSmoothing={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("smooth-before-btn")).not.toBeInTheDocument();
  });
});
