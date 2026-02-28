/**
 * Tests for WatermarkOverlay component (PRD-82).
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { WatermarkOverlay } from "../WatermarkOverlay";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("WatermarkOverlay", () => {
  test("renders text content", () => {
    render(<WatermarkOverlay text="CONFIDENTIAL" />);

    const overlay = screen.getByTestId("watermark-overlay");
    expect(overlay).toHaveTextContent("CONFIDENTIAL");
  });

  test("applies center position styling", () => {
    render(<WatermarkOverlay position="center" />);

    const overlay = screen.getByTestId("watermark-overlay");
    expect(overlay.className).toContain("inset-0");
    expect(overlay.className).toContain("-rotate-45");
  });

  test("applies corner position styling", () => {
    render(<WatermarkOverlay position="corner" />);

    const overlay = screen.getByTestId("watermark-overlay");
    expect(overlay.className).toContain("bottom-2");
    expect(overlay.className).toContain("right-2");
  });

  test("respects opacity prop", () => {
    render(<WatermarkOverlay opacity={0.7} />);

    const overlay = screen.getByTestId("watermark-overlay");
    expect(overlay).toHaveStyle({ opacity: 0.7 });
  });
});
