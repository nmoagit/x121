import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { RePathPanel } from "../RePathPanel";
import type { FieldInfo } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const sampleFields: FieldInfo[] = [
  {
    entity_type: "source_image",
    table_name: "source_images",
    column_name: "file_path",
  },
  {
    entity_type: "derived_image",
    table_name: "derived_images",
    column_name: "file_path",
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("RePathPanel", () => {
  it("renders the panel shell", () => {
    renderWithProviders(<RePathPanel />);

    expect(screen.getByTestId("repath-panel")).toBeInTheDocument();
    expect(screen.getByText("Re-Path")).toBeInTheDocument();
  });

  it("renders old and new prefix inputs", () => {
    renderWithProviders(<RePathPanel />);

    expect(screen.getByTestId("old-prefix-input")).toBeInTheDocument();
    expect(screen.getByTestId("new-prefix-input")).toBeInTheDocument();
  });

  it("renders validate-paths toggle", () => {
    renderWithProviders(<RePathPanel />);

    expect(screen.getByTestId("validate-paths-toggle")).toBeInTheDocument();
  });

  it("disables preview button when inputs are empty", () => {
    renderWithProviders(<RePathPanel />);

    expect(screen.getByTestId("preview-btn")).toBeDisabled();
  });

  it("enables preview button when both prefix inputs have values", () => {
    renderWithProviders(<RePathPanel />);

    fireEvent.change(screen.getByTestId("old-prefix-input"), {
      target: { value: "/old" },
    });
    fireEvent.change(screen.getByTestId("new-prefix-input"), {
      target: { value: "/new" },
    });

    expect(screen.getByTestId("preview-btn")).not.toBeDisabled();
  });

  it("calls onPreview with correct body", () => {
    const onPreview = vi.fn();
    renderWithProviders(<RePathPanel onPreview={onPreview} />);

    fireEvent.change(screen.getByTestId("old-prefix-input"), {
      target: { value: "/data/old" },
    });
    fireEvent.change(screen.getByTestId("new-prefix-input"), {
      target: { value: "/data/new" },
    });
    fireEvent.click(screen.getByTestId("preview-btn"));

    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        old_prefix: "/data/old",
        new_prefix: "/data/new",
        validate_new_paths: false,
      }),
    );
  });

  it("shows preview table with highlight when validate paths is on", () => {
    renderWithProviders(
      <RePathPanel
        previewFields={sampleFields}
        previewTotalMatches={2}
        previewOperationId={5}
      />,
    );

    expect(screen.getByTestId("preview-table")).toBeInTheDocument();
  });
});
