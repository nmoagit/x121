import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { GapAnalysisPanel } from "../GapAnalysisPanel";
import type { GapReport } from "../types";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("GapAnalysisPanel", () => {
  it("renders the gap analysis panel", () => {
    renderWithProviders(<GapAnalysisPanel gapReport={{}} />);

    expect(screen.getByTestId("gap-analysis-panel")).toBeInTheDocument();
    expect(screen.getByText("Gap Analysis")).toBeInTheDocument();
  });

  it("shows no gaps message when report is empty", () => {
    renderWithProviders(<GapAnalysisPanel gapReport={{}} />);

    expect(screen.getByTestId("no-gaps")).toBeInTheDocument();
  });

  it("shows summary counts when present", () => {
    const gapReport: GapReport = {
      summary: {
        missing_metadata: 3,
        missing_source_image: 2,
      },
    };
    renderWithProviders(<GapAnalysisPanel gapReport={gapReport} />);

    expect(screen.getByTestId("gap-summary")).toBeInTheDocument();
    expect(screen.getByTestId("gap-summary-missing_metadata")).toBeInTheDocument();
    expect(screen.getByTestId("gap-summary-missing_source_image")).toBeInTheDocument();
  });

  it("shows gap items when present", () => {
    const gapReport: GapReport = {
      gaps: [
        {
          gap_type: "missing_metadata",
          entity_name: "Alice",
          details: "No metadata file found",
        },
        {
          gap_type: "missing_scene",
          entity_name: "Bob",
          details: "No scene subfolders",
        },
      ],
    };
    renderWithProviders(<GapAnalysisPanel gapReport={gapReport} />);

    expect(screen.getByTestId("gap-list")).toBeInTheDocument();
    expect(screen.getByTestId("gap-item-0")).toBeInTheDocument();
    expect(screen.getByTestId("gap-item-1")).toBeInTheDocument();
  });

  it("displays correct gap type labels", () => {
    const gapReport: GapReport = {
      gaps: [
        {
          gap_type: "missing_metadata",
          entity_name: "Alice",
          details: "No metadata file found",
        },
      ],
    };
    renderWithProviders(<GapAnalysisPanel gapReport={gapReport} />);

    expect(screen.getByText("Missing Metadata")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows both summary and items together", () => {
    const gapReport: GapReport = {
      summary: { missing_metadata: 1 },
      gaps: [
        {
          gap_type: "missing_metadata",
          entity_name: "Charlie",
          details: "Metadata file missing",
        },
      ],
    };
    renderWithProviders(<GapAnalysisPanel gapReport={gapReport} />);

    expect(screen.getByTestId("gap-summary")).toBeInTheDocument();
    expect(screen.getByTestId("gap-list")).toBeInTheDocument();
  });
});
