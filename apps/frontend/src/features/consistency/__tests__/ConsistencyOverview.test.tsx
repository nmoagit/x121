/**
 * Tests for ConsistencyOverview component (PRD-94).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ConsistencyOverview } from "../ConsistencyOverview";
import type { ConsistencyReport } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const makeReport = (overrides: Partial<ConsistencyReport> = {}): ConsistencyReport => ({
  id: 1,
  character_id: 1,
  project_id: 1,
  scores_json: { matrix: [], scene_ids: [], scene_labels: [] },
  overall_consistency_score: 0.9,
  outlier_scene_ids: null,
  report_type: "full",
  created_at: "2026-02-28T10:00:00Z",
  updated_at: "2026-02-28T10:00:00Z",
  ...overrides,
});

const characters = [
  { characterId: 1, characterName: "Alice", report: makeReport({ overall_consistency_score: 0.92 }) },
  { characterId: 2, characterName: "Bob", report: makeReport({ id: 2, character_id: 2, overall_consistency_score: 0.6 }) },
  { characterId: 3, characterName: "Charlie", report: null },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ConsistencyOverview", () => {
  test("shows project summary with consistent count", () => {
    renderWithProviders(
      <ConsistencyOverview characters={characters} />,
    );

    const overview = screen.getByTestId("consistency-overview");
    // Alice is >= 0.85, Bob is < 0.85, Charlie has no report
    expect(overview).toHaveTextContent("1 of 3 consistent");
  });

  test("lists character rows with names", () => {
    renderWithProviders(
      <ConsistencyOverview characters={characters} />,
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  test("shows generate button for characters without report", () => {
    const handleGenerate = vi.fn();

    renderWithProviders(
      <ConsistencyOverview
        characters={characters}
        onGenerate={handleGenerate}
      />,
    );

    // Charlie has no report, so should show Generate button
    const generateBtns = screen.getAllByTestId("generate-btn");
    expect(generateBtns.length).toBeGreaterThanOrEqual(1);
  });
});
