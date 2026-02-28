/**
 * Tests for ContactSheetControls component (PRD-103).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ContactSheetControls } from "../ContactSheetControls";

/* --------------------------------------------------------------------------
   Default props helper
   -------------------------------------------------------------------------- */

function renderControls(overrides: Partial<Parameters<typeof ContactSheetControls>[0]> = {}) {
  const defaults = {
    imageCount: 0,
    exportFormat: "png" as const,
    onExportFormatChange: vi.fn(),
    columns: 4 as const,
    onColumnsChange: vi.fn(),
    onGenerate: vi.fn(),
    onExport: vi.fn(),
    ...overrides,
  };
  return renderWithProviders(<ContactSheetControls {...defaults} />);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ContactSheetControls", () => {
  test("shows generate button", () => {
    renderControls();

    const btn = screen.getByTestId("generate-btn");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("Generate Face Crops");
  });

  test("shows export format options", () => {
    renderControls();

    const formatSelect = screen.getByTestId("export-format-select");
    expect(formatSelect).toBeInTheDocument();
  });

  test("disables export when no images", () => {
    renderControls({ imageCount: 0 });

    const exportBtn = screen.getByTestId("export-btn");
    expect(exportBtn).toBeDisabled();
  });
});
