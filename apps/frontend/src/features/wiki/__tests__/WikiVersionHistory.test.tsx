/**
 * Tests for WikiVersionHistory component (PRD-56).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { WikiVersionHistory } from "../WikiVersionHistory";
import type { DiffLine, WikiVersion } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockVersions: WikiVersion[] = [
  {
    id: 3,
    article_id: 1,
    version: 3,
    content_md: "Updated content v3",
    edited_by: 100,
    edit_summary: "Fixed typo",
    created_at: "2026-02-20T14:00:00Z",
  },
  {
    id: 2,
    article_id: 1,
    version: 2,
    content_md: "Updated content v2",
    edited_by: 101,
    edit_summary: "Added new section",
    created_at: "2026-02-20T12:00:00Z",
  },
  {
    id: 1,
    article_id: 1,
    version: 1,
    content_md: "Initial content",
    edited_by: 100,
    edit_summary: "Initial version",
    created_at: "2026-02-20T10:00:00Z",
  },
];

const mockDiffLines: DiffLine[] = [
  { line_type: "removed", content: "old line" },
  { line_type: "added", content: "new line" },
  { line_type: "unchanged", content: "same line" },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("WikiVersionHistory", () => {
  test("renders version list", () => {
    renderWithProviders(
      <WikiVersionHistory versions={mockVersions} />,
    );

    expect(screen.getByTestId("wiki-version-history")).toBeInTheDocument();
    expect(screen.getByTestId("wiki-version-list")).toBeInTheDocument();
    expect(screen.getByTestId("wiki-version-3")).toBeInTheDocument();
    expect(screen.getByTestId("wiki-version-2")).toBeInTheDocument();
    expect(screen.getByTestId("wiki-version-1")).toBeInTheDocument();

    // Check summaries are displayed.
    expect(screen.getByTestId("wiki-version-summary-3")).toHaveTextContent(
      "Fixed typo",
    );
    expect(screen.getByTestId("wiki-version-summary-2")).toHaveTextContent(
      "Added new section",
    );
  });

  test("shows diff for selected versions", () => {
    renderWithProviders(
      <WikiVersionHistory
        versions={mockVersions}
        diffLines={mockDiffLines}
        onDiffSelect={vi.fn()}
      />,
    );

    const diffDisplay = screen.getByTestId("wiki-diff-display");
    expect(diffDisplay).toBeInTheDocument();
    expect(screen.getByTestId("wiki-diff-line-0")).toHaveTextContent(
      "old line",
    );
    expect(screen.getByTestId("wiki-diff-line-1")).toHaveTextContent(
      "new line",
    );
    expect(screen.getByTestId("wiki-diff-line-2")).toHaveTextContent(
      "same line",
    );
  });

  test("supports revert action", () => {
    const onRevert = vi.fn();
    renderWithProviders(
      <WikiVersionHistory
        versions={mockVersions}
        onRevert={onRevert}
      />,
    );

    const revertButton = screen.getByTestId("wiki-revert-2");
    expect(revertButton).toBeInTheDocument();
    fireEvent.click(revertButton);
    expect(onRevert).toHaveBeenCalledWith(2);
  });
});
