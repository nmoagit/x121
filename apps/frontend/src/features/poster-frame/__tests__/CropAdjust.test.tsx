import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { CropAdjust } from "../CropAdjust";
import type { PosterFrame } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makePosterFrame = (
  overrides: Partial<PosterFrame> = {},
): PosterFrame => ({
  id: 1,
  entity_type: "character",
  entity_id: 1,
  segment_id: 10,
  frame_number: 42,
  image_path: "/posters/char1.jpg",
  crop_settings_json: null,
  brightness: 1.0,
  contrast: 1.0,
  created_by: 1,
  created_at: "2026-02-28T10:00:00Z",
  updated_at: "2026-02-28T10:00:00Z",
  ...overrides,
});

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("CropAdjust", () => {
  it("renders sliders and preview image", () => {
    renderWithProviders(
      <CropAdjust
        posterFrame={makePosterFrame()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId("crop-adjust")).toBeInTheDocument();
    expect(screen.getByTestId("crop-preview")).toBeInTheDocument();
    expect(screen.getByTestId("brightness-slider")).toBeInTheDocument();
    expect(screen.getByTestId("contrast-slider")).toBeInTheDocument();
  });

  it("updates preview filter when brightness slider changes", () => {
    renderWithProviders(
      <CropAdjust
        posterFrame={makePosterFrame()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const slider = screen.getByTestId("brightness-slider");
    fireEvent.change(slider, { target: { value: "1.30" } });

    const preview = screen.getByTestId("crop-preview");
    expect(preview.style.filter).toContain("brightness(1.3)");
  });

  it("updates preview filter when contrast slider changes", () => {
    renderWithProviders(
      <CropAdjust
        posterFrame={makePosterFrame()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const slider = screen.getByTestId("contrast-slider");
    fireEvent.change(slider, { target: { value: "0.75" } });

    const preview = screen.getByTestId("crop-preview");
    expect(preview.style.filter).toContain("contrast(0.75)");
  });

  it("calls onSave with current adjustments", () => {
    const onSave = vi.fn();

    renderWithProviders(
      <CropAdjust
        posterFrame={makePosterFrame({ brightness: 1.0, contrast: 1.0 })}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("save-button"));

    expect(onSave).toHaveBeenCalledWith({
      brightness: 1.0,
      contrast: 1.0,
    });
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();

    renderWithProviders(
      <CropAdjust
        posterFrame={makePosterFrame()}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByTestId("cancel-button"));

    expect(onCancel).toHaveBeenCalled();
  });

  it("resets sliders to defaults when reset is clicked", () => {
    renderWithProviders(
      <CropAdjust
        posterFrame={makePosterFrame({ brightness: 1.3, contrast: 0.8 })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("reset-button"));

    const preview = screen.getByTestId("crop-preview");
    expect(preview.style.filter).toBe("brightness(1) contrast(1)");
  });

  it("renders aspect ratio options", () => {
    renderWithProviders(
      <CropAdjust
        posterFrame={makePosterFrame()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId("aspect-1:1")).toBeInTheDocument();
    expect(screen.getByTestId("aspect-16:9")).toBeInTheDocument();
    expect(screen.getByTestId("aspect-4:3")).toBeInTheDocument();
    expect(screen.getByTestId("aspect-custom")).toBeInTheDocument();
  });

  it("includes crop settings in save when aspect ratio is selected", () => {
    const onSave = vi.fn();

    renderWithProviders(
      <CropAdjust
        posterFrame={makePosterFrame()}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    // Select an aspect ratio first
    fireEvent.click(screen.getByTestId("aspect-16:9"));
    fireEvent.click(screen.getByTestId("save-button"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        crop_settings_json: expect.objectContaining({
          aspectRatio: "16:9",
        }),
      }),
    );
  });
});
