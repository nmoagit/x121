import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { SelectiveImport } from "../SelectiveImport";
import type { ProjectConfig } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const MOCK_CONFIG: ProjectConfig = {
  id: 1,
  name: "Test Config",
  description: "A test config",
  version: 1,
  config_json: {
    scene_types: [
      { name: "close-up", prompt: "test" },
      { name: "wide-shot", prompt: "test2" },
      { name: "aerial", prompt: "test3" },
    ],
  },
  source_project_id: null,
  is_recommended: false,
  created_by_id: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("SelectiveImport", () => {
  it("renders checkboxes for each scene type", () => {
    renderWithProviders(
      <SelectiveImport config={MOCK_CONFIG} projectId={42} />,
    );

    expect(screen.getByTestId("selective-import")).toBeInTheDocument();
    expect(
      screen.getByTestId("scene-type-checkbox-close-up"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("scene-type-checkbox-wide-shot"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("scene-type-checkbox-aerial"),
    ).toBeInTheDocument();
  });

  it("all checkboxes start checked by default", () => {
    renderWithProviders(
      <SelectiveImport config={MOCK_CONFIG} projectId={42} />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    checkboxes.forEach((cb) => {
      expect(cb).toBeChecked();
    });
  });

  it("deselect all unchecks all checkboxes", () => {
    renderWithProviders(
      <SelectiveImport config={MOCK_CONFIG} projectId={42} />,
    );

    fireEvent.click(screen.getByTestId("deselect-all-btn"));

    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => {
      expect(cb).not.toBeChecked();
    });
  });

  it("select all re-checks all checkboxes after deselect", () => {
    renderWithProviders(
      <SelectiveImport config={MOCK_CONFIG} projectId={42} />,
    );

    // First deselect all
    fireEvent.click(screen.getByTestId("deselect-all-btn"));
    // Then select all
    fireEvent.click(screen.getByTestId("select-all-btn"));

    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => {
      expect(cb).toBeChecked();
    });
  });

  it("renders import button with correct count", () => {
    renderWithProviders(
      <SelectiveImport config={MOCK_CONFIG} projectId={42} />,
    );

    expect(screen.getByTestId("import-btn")).toHaveTextContent(
      "Import 3 Scene Types",
    );
  });

  it("renders cancel button when callback provided", () => {
    const onCancel = () => {};
    renderWithProviders(
      <SelectiveImport
        config={MOCK_CONFIG}
        projectId={42}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByTestId("import-cancel-btn")).toBeInTheDocument();
  });
});
