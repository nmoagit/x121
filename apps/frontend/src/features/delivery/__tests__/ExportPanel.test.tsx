import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ExportPanel } from "../ExportPanel";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ export_id: 1, status: "pending" }),
  },
}));

const characters = [
  { id: 1, name: "Luna" },
  { id: 2, name: "Kai" },
];

describe("ExportPanel", () => {
  it("renders profile selection and character checkboxes", () => {
    renderWithProviders(
      <ExportPanel projectId={1} characters={characters} />,
    );

    expect(screen.getByTestId("export-panel")).toBeInTheDocument();
    expect(screen.getByText("Export Delivery")).toBeInTheDocument();
    expect(screen.getByTestId("start-export-button")).toBeInTheDocument();
  });

  it("shows progress when export is in progress", () => {
    renderWithProviders(
      <ExportPanel projectId={1} characters={characters} activeExportStatus={2} />,
    );

    expect(screen.getByTestId("export-progress")).toBeInTheDocument();
    expect(screen.getByText("Assembling")).toBeInTheDocument();
    expect(screen.getByText("Export in progress...")).toBeInTheDocument();
  });

  it("disables start button when no profile is selected", () => {
    renderWithProviders(
      <ExportPanel projectId={1} characters={characters} />,
    );

    const button = screen.getByTestId("start-export-button");
    expect(button).toBeDisabled();
  });
});
