import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { OverridePreviewDialog } from "../OverridePreviewDialog";
import type { OverrideDiff } from "../types";

const MOCK_DIFFS: OverrideDiff[] = [
  {
    field: "brightness",
    current_value: 50,
    preset_value: 80,
  },
  {
    field: "contrast",
    current_value: null,
    preset_value: 70,
  },
];

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
  },
}));

describe("OverridePreviewDialog", () => {
  it("shows changed fields highlighted", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    renderWithProviders(
      <OverridePreviewDialog
        diffs={MOCK_DIFFS}
        presetName="Cinematic Look"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByTestId("diff-field-brightness")).toBeInTheDocument();
    expect(screen.getByTestId("diff-field-contrast")).toBeInTheDocument();
  });

  it("shows current vs new values", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    renderWithProviders(
      <OverridePreviewDialog
        diffs={MOCK_DIFFS}
        presetName="Test"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const currentValues = screen.getAllByTestId("current-value");
    const presetValues = screen.getAllByTestId("preset-value");

    expect(currentValues[0]).toHaveTextContent("50");
    expect(presetValues[0]).toHaveTextContent("80");
  });

  it("calls apply handler on confirm", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    renderWithProviders(
      <OverridePreviewDialog
        diffs={MOCK_DIFFS}
        presetName="Test"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByTestId("confirm-button"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
