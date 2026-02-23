import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { LegacyImportWizard } from "../LegacyImportWizard";
import type { LegacyImportRun } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeRun = (overrides: Partial<LegacyImportRun> = {}): LegacyImportRun => ({
  id: 1,
  status_id: 1,
  source_path: "/data/legacy/characters",
  project_id: 10,
  mapping_config: {},
  match_key: "name",
  total_files: 42,
  characters_created: 10,
  characters_updated: 5,
  scenes_registered: 8,
  images_registered: 20,
  duplicates_found: 2,
  errors: 1,
  gap_report: {},
  initiated_by: 1,
  created_at: "2026-02-23T10:00:00Z",
  updated_at: "2026-02-23T10:00:00Z",
  ...overrides,
});

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("LegacyImportWizard", () => {
  it("renders the wizard shell", () => {
    renderWithProviders(<LegacyImportWizard projectId={10} />);

    expect(screen.getByTestId("legacy-import-wizard")).toBeInTheDocument();
    expect(screen.getByText("Legacy Data Import")).toBeInTheDocument();
  });

  it("shows step navigation", () => {
    renderWithProviders(<LegacyImportWizard projectId={10} />);

    expect(screen.getByTestId("wizard-steps")).toBeInTheDocument();
    expect(screen.getByTestId("step-source")).toBeInTheDocument();
    expect(screen.getByTestId("step-mapping")).toBeInTheDocument();
    expect(screen.getByTestId("step-preview")).toBeInTheDocument();
    expect(screen.getByTestId("step-import")).toBeInTheDocument();
  });

  it("starts on source step", () => {
    renderWithProviders(<LegacyImportWizard projectId={10} />);

    expect(screen.getByTestId("source-selection")).toBeInTheDocument();
  });

  it("navigates to mapping step when step button clicked", () => {
    renderWithProviders(<LegacyImportWizard projectId={10} />);

    fireEvent.click(screen.getByTestId("step-mapping"));
    expect(screen.getByTestId("mapping-config")).toBeInTheDocument();
  });

  it("navigates to preview step when step button clicked", () => {
    renderWithProviders(
      <LegacyImportWizard
        projectId={10}
        inferredEntities={[]}
      />,
    );

    fireEvent.click(screen.getByTestId("step-preview"));
    expect(screen.getByTestId("import-preview")).toBeInTheDocument();
  });

  it("shows import progress on import step with run data", () => {
    const run = makeRun();
    renderWithProviders(
      <LegacyImportWizard
        projectId={10}
        run={run}
        statusName="importing"
      />,
    );

    fireEvent.click(screen.getByTestId("step-import"));
    expect(screen.getByTestId("import-progress")).toBeInTheDocument();
  });

  it("calls onCreateRun when source is selected", () => {
    const onCreateRun = vi.fn();
    renderWithProviders(
      <LegacyImportWizard projectId={10} onCreateRun={onCreateRun} />,
    );

    fireEvent.change(screen.getByTestId("source-path-input"), {
      target: { value: "/data/legacy" },
    });
    fireEvent.click(screen.getByTestId("start-scan-btn"));

    expect(onCreateRun).toHaveBeenCalledWith("/data/legacy", 10, "name");
  });
});
