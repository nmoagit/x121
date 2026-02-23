/**
 * Tests for SimilarityAlert component (PRD-79).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { SimilarityAlert } from "../SimilarityAlert";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("SimilarityAlert", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    sourceName: "Character A",
    matchedName: "Character B",
    similarityScore: 92.5,
    onLinkExisting: vi.fn(),
    onCreateNew: vi.fn(),
  };

  test("renders side-by-side comparison of source and matched characters", () => {
    renderWithProviders(<SimilarityAlert {...defaultProps} />);

    expect(screen.getByTestId("source-character")).toBeInTheDocument();
    expect(screen.getByText("Character A")).toBeInTheDocument();
    expect(screen.getByTestId("matched-character")).toBeInTheDocument();
    expect(screen.getByText("Character B")).toBeInTheDocument();
  });

  test("shows similarity score as percentage", () => {
    renderWithProviders(<SimilarityAlert {...defaultProps} />);

    expect(screen.getByText("92.5%")).toBeInTheDocument();
  });

  test("calls resolution handlers on button clicks", () => {
    const onLinkExisting = vi.fn();
    const onCreateNew = vi.fn();
    const onClose = vi.fn();

    renderWithProviders(
      <SimilarityAlert
        {...defaultProps}
        onLinkExisting={onLinkExisting}
        onCreateNew={onCreateNew}
        onClose={onClose}
      />,
    );

    screen.getByTestId("link-existing-btn").click();
    expect(onLinkExisting).toHaveBeenCalledTimes(1);

    screen.getByTestId("create-new-btn").click();
    expect(onCreateNew).toHaveBeenCalledTimes(1);
  });
});
