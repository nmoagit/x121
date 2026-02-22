import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { PresetEditor } from "../PresetEditor";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
  },
}));

describe("PresetEditor", () => {
  it("renders form fields", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    renderWithProviders(<PresetEditor onSave={onSave} onCancel={onCancel} />);

    expect(screen.getByTestId("preset-name-input")).toBeInTheDocument();
    expect(screen.getByTestId("preset-description-input")).toBeInTheDocument();
    expect(screen.getByTestId("parameters-input")).toBeInTheDocument();
    expect(screen.getByTestId("save-button")).toBeInTheDocument();
  });

  it("shows scope selector with three options", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    renderWithProviders(<PresetEditor onSave={onSave} onCancel={onCancel} />);

    const select = screen.getByTestId("scope-select") as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.options.length).toBe(3);
    expect(select.value).toBe("personal");
  });

  it("shows validation error for empty name", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    renderWithProviders(<PresetEditor onSave={onSave} onCancel={onCancel} />);

    // Default name is empty, so the error should show
    expect(screen.getByTestId("name-error")).toHaveTextContent("Name is required");
  });
});
