import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ImportPreview } from "../ImportPreview";
import type { InferredEntity } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeEntity = (overrides: Partial<InferredEntity> = {}): InferredEntity => ({
  source_path: "Alice/portrait.png",
  entity_type: "character",
  captured_values: { name: "Alice" },
  inferred_name: "Alice",
  ...overrides,
});

const entities: InferredEntity[] = [
  makeEntity({ inferred_name: "Alice", entity_type: "character" }),
  makeEntity({
    inferred_name: "Bob",
    entity_type: "character",
    source_path: "Bob/portrait.png",
    captured_values: { name: "Bob" },
  }),
  makeEntity({
    inferred_name: "intro",
    entity_type: "scene",
    source_path: "Alice/scenes/intro/file.png",
    captured_values: { name: "Alice", scene: "intro" },
  }),
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ImportPreview", () => {
  it("renders the preview component", () => {
    renderWithProviders(<ImportPreview entities={entities} />);

    expect(screen.getByTestId("import-preview")).toBeInTheDocument();
  });

  it("shows entity table with rows", () => {
    renderWithProviders(<ImportPreview entities={entities} />);

    expect(screen.getByTestId("preview-table")).toBeInTheDocument();
    expect(screen.getByTestId("preview-row-0")).toBeInTheDocument();
    expect(screen.getByTestId("preview-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("preview-row-2")).toBeInTheDocument();
  });

  it("shows summary with counts", () => {
    renderWithProviders(<ImportPreview entities={entities} />);

    expect(screen.getByTestId("preview-summary")).toBeInTheDocument();
    expect(screen.getByText("Total: 3")).toBeInTheDocument();
  });

  it("shows empty state when no entities", () => {
    renderWithProviders(<ImportPreview entities={[]} />);

    expect(screen.getByTestId("no-entities")).toBeInTheDocument();
  });

  it("disables confirm button when no entities", () => {
    renderWithProviders(<ImportPreview entities={[]} />);

    expect(screen.getByTestId("confirm-import-btn")).toBeDisabled();
  });

  it("calls onConfirm when confirm button clicked", () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <ImportPreview entities={entities} onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByTestId("confirm-import-btn"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onCancel when cancel button clicked", () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <ImportPreview entities={entities} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByTestId("cancel-import-btn"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("disables buttons when disabled prop is true", () => {
    renderWithProviders(<ImportPreview entities={entities} disabled />);

    expect(screen.getByTestId("cancel-import-btn")).toBeDisabled();
  });
});
