import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ImportWizard } from "../ImportWizard";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const mockImport = vi.fn();
const mockValidate = vi.fn();

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ImportWizard", () => {
  it("renders the upload step by default", () => {
    renderWithProviders(
      <ImportWizard onImport={mockImport} />,
    );

    expect(screen.getByTestId("import-wizard")).toBeInTheDocument();
    expect(screen.getByTestId("step-upload")).toBeInTheDocument();
  });

  it("shows step indicator with all steps", () => {
    renderWithProviders(
      <ImportWizard onImport={mockImport} />,
    );

    expect(screen.getByTestId("step-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("indicator-upload")).toBeInTheDocument();
    expect(screen.getByTestId("indicator-validation")).toBeInTheDocument();
    expect(screen.getByTestId("indicator-parameters")).toBeInTheDocument();
    expect(screen.getByTestId("indicator-done")).toBeInTheDocument();
  });

  it("renders upload area with file input and textarea", () => {
    renderWithProviders(
      <ImportWizard onImport={mockImport} />,
    );

    expect(screen.getByTestId("file-upload")).toBeInTheDocument();
    expect(screen.getByTestId("json-textarea")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-name-input")).toBeInTheDocument();
  });

  it("disables import button when name or JSON is empty", () => {
    renderWithProviders(
      <ImportWizard onImport={mockImport} />,
    );

    const importBtn = screen.getByTestId("import-btn");
    expect(importBtn).toBeDisabled();
  });

  it("renders with isImporting state", () => {
    renderWithProviders(
      <ImportWizard
        onImport={mockImport}
        onValidate={mockValidate}
        isImporting
      />,
    );

    const importBtn = screen.getByTestId("import-btn");
    expect(importBtn).toBeDisabled();
    expect(importBtn).toHaveTextContent("Importing...");
  });
});
