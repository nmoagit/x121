/**
 * Tests for BlurredMedia component (PRD-82).
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { BlurredMedia } from "../BlurredMedia";
import type { SensitivityContextValue } from "../SensitivityProvider";

/* --------------------------------------------------------------------------
   Mock the SensitivityProvider
   -------------------------------------------------------------------------- */

const mockGetViewLevel = vi.fn();

vi.mock("../SensitivityProvider", () => ({
  useSensitivity: (): SensitivityContextValue => ({
    globalLevel: "full",
    adminMinLevel: "full",
    screenShareMode: false,
    viewOverrides: {},
    watermarkEnabled: false,
    watermarkText: null,
    watermarkPosition: "center",
    watermarkOpacity: 0.3,
    getViewLevel: mockGetViewLevel,
    setGlobalLevel: vi.fn(),
    setViewOverride: vi.fn(),
    toggleScreenShareMode: vi.fn(),
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("BlurredMedia", () => {
  test("renders image unblurred when level is full", () => {
    mockGetViewLevel.mockReturnValue("full");

    render(<BlurredMedia src="/test.jpg" alt="Test image" />);

    const img = screen.getByAltText("Test image");
    expect(img).toBeInTheDocument();
    expect(img).toHaveStyle({ filter: "none" });
  });

  test("applies soft blur (8px) CSS filter", () => {
    mockGetViewLevel.mockReturnValue("soft_blur");

    render(<BlurredMedia src="/test.jpg" alt="Soft blur" />);

    const img = screen.getByAltText("Soft blur");
    expect(img).toHaveStyle({ filter: "blur(8px)" });
  });

  test("applies heavy blur (24px) CSS filter", () => {
    mockGetViewLevel.mockReturnValue("heavy_blur");

    render(<BlurredMedia src="/test.jpg" alt="Heavy blur" />);

    const img = screen.getByAltText("Heavy blur");
    expect(img).toHaveStyle({ filter: "blur(24px)" });
  });

  test("shows placeholder icon when level is placeholder", () => {
    mockGetViewLevel.mockReturnValue("placeholder");

    render(<BlurredMedia src="/test.jpg" alt="Placeholder" />);

    // Should NOT render the image
    expect(screen.queryByAltText("Placeholder")).not.toBeInTheDocument();

    // Should render the placeholder container
    const container = screen.getByTestId("blurred-media");
    expect(container).toBeInTheDocument();
    expect(screen.getByLabelText("Content hidden")).toBeInTheDocument();
  });

  test("respects view override over global level", () => {
    mockGetViewLevel.mockImplementation((viewName: string) => {
      if (viewName === "timeline") return "heavy_blur";
      return "full";
    });

    render(<BlurredMedia src="/test.jpg" alt="Timeline" viewContext="timeline" />);

    const img = screen.getByAltText("Timeline");
    expect(img).toHaveStyle({ filter: "blur(24px)" });
  });

  test("respects screen-share mode (shows placeholder)", () => {
    mockGetViewLevel.mockReturnValue("placeholder");

    render(<BlurredMedia src="/test.jpg" alt="Screen share" />);

    expect(screen.queryByAltText("Screen share")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Content hidden")).toBeInTheDocument();
  });
});
