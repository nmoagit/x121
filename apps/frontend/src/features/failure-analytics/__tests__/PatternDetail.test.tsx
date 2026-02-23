/**
 * Tests for PatternDetail component (PRD-64).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { PatternDetail } from "../PatternDetail";
import type { FailurePattern, PatternFix } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockPattern: FailurePattern = {
  id: 42,
  pattern_key: "w:5:c:12",
  description: "High failure when using LoRA A with Character B",
  dimension_workflow_id: 5,
  dimension_lora_id: 3,
  dimension_character_id: 12,
  dimension_scene_type_id: null,
  dimension_segment_position: "6+",
  failure_count: 8,
  total_count: 15,
  failure_rate: 0.533,
  severity: "high",
  last_occurrence: "2026-02-22T14:30:00Z",
  created_at: "2026-02-20T10:00:00Z",
  updated_at: "2026-02-22T14:30:00Z",
};

const mockFixes: PatternFix[] = [
  {
    id: 1,
    pattern_id: 42,
    fix_description: "Reduce LoRA weight to 0.7",
    fix_parameters: { lora_weight: 0.7 },
    effectiveness: "improved",
    reported_by_id: 1,
    created_at: "2026-02-21T08:00:00Z",
    updated_at: "2026-02-21T08:00:00Z",
  },
  {
    id: 2,
    pattern_id: 42,
    fix_description: "Use alternative checkpoint model",
    fix_parameters: null,
    effectiveness: "resolved",
    reported_by_id: 2,
    created_at: "2026-02-22T10:00:00Z",
    updated_at: "2026-02-22T10:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-failure-analytics", () => ({
  usePatternFixes: () => ({
    data: mockFixes,
    isPending: false,
  }),
  useCreateFix: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("PatternDetail", () => {
  test("renders pattern info card", () => {
    renderWithProviders(<PatternDetail pattern={mockPattern} />);

    expect(screen.getByTestId("pattern-detail")).toBeInTheDocument();
    expect(screen.getByText("Pattern #42")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  test("displays failure rate and counts", () => {
    renderWithProviders(<PatternDetail pattern={mockPattern} />);

    expect(screen.getByTestId("failure-rate")).toHaveTextContent("53.3%");
    expect(screen.getByText("8 / 15")).toBeInTheDocument();
  });

  test("shows pattern description", () => {
    renderWithProviders(<PatternDetail pattern={mockPattern} />);

    expect(
      screen.getByText("High failure when using LoRA A with Character B"),
    ).toBeInTheDocument();
  });

  test("shows dimension values", () => {
    renderWithProviders(<PatternDetail pattern={mockPattern} />);

    expect(screen.getByText("#5")).toBeInTheDocument(); // workflow
    expect(screen.getByText("#12")).toBeInTheDocument(); // character
    expect(screen.getByText("#3")).toBeInTheDocument(); // lora
    expect(screen.getByText("6+")).toBeInTheDocument(); // segment position
  });

  test("renders fixes list", () => {
    renderWithProviders(<PatternDetail pattern={mockPattern} />);

    expect(screen.getByTestId("fixes-list")).toBeInTheDocument();
    expect(
      screen.getByText("Reduce LoRA weight to 0.7"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Use alternative checkpoint model"),
    ).toBeInTheDocument();
  });

  test("shows effectiveness badges on fixes", () => {
    renderWithProviders(<PatternDetail pattern={mockPattern} />);

    expect(screen.getByText("improved")).toBeInTheDocument();
    expect(screen.getByText("resolved")).toBeInTheDocument();
  });

  test("renders add fix form", () => {
    renderWithProviders(<PatternDetail pattern={mockPattern} />);

    expect(screen.getByTestId("fix-description-input")).toBeInTheDocument();
    expect(screen.getByTestId("submit-fix-button")).toBeInTheDocument();
  });
});
