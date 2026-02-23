/**
 * Tests for BatchDuplicateGrid component (PRD-79).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { BatchDuplicateGrid } from "../BatchDuplicateGrid";
import type { FlaggedPair } from "../BatchDuplicateGrid";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const pairs: FlaggedPair[] = [
  {
    checkId: 1,
    characterAName: "Alice",
    characterBName: "Alice Clone",
    similarityScore: 96.3,
  },
  {
    checkId: 2,
    characterAName: "Bob",
    characterBName: "Robert",
    similarityScore: 88.1,
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("BatchDuplicateGrid", () => {
  test("renders all flagged pairs", () => {
    const onResolve = vi.fn();
    renderWithProviders(
      <BatchDuplicateGrid pairs={pairs} onResolve={onResolve} />,
    );

    expect(screen.getByTestId("pair-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("pair-card-2")).toBeInTheDocument();
    expect(screen.getByText("Flagged Duplicates (2)")).toBeInTheDocument();
  });

  test("shows per-pair resolution controls with character names", () => {
    const onResolve = vi.fn();
    renderWithProviders(
      <BatchDuplicateGrid pairs={pairs} onResolve={onResolve} />,
    );

    expect(screen.getByTestId("pair-a-1")).toHaveTextContent("Alice");
    expect(screen.getByTestId("pair-b-1")).toHaveTextContent("Alice Clone");
    expect(screen.getByText("96.3%")).toBeInTheDocument();
    expect(screen.getByText("88.1%")).toBeInTheDocument();
  });

  test("shows empty state when no pairs", () => {
    const onResolve = vi.fn();
    renderWithProviders(
      <BatchDuplicateGrid pairs={[]} onResolve={onResolve} />,
    );

    expect(screen.getByText("No duplicates found.")).toBeInTheDocument();
  });
});
