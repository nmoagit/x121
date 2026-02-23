import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { PromptLibraryBrowser } from "../PromptLibraryBrowser";
import type { PromptLibraryEntry } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const makeEntry = (
  overrides: Partial<PromptLibraryEntry> = {},
): PromptLibraryEntry => ({
  id: 1,
  name: "Cinematic Portrait",
  description: "A cinematic style portrait prompt",
  positive_prompt: "cinematic portrait, dramatic lighting, 8k",
  negative_prompt: "blurry, low quality",
  tags: ["portrait", "cinematic"],
  model_compatibility: ["SDXL"],
  usage_count: 42,
  avg_rating: 4.5,
  owner_id: 1,
  created_at: "2026-02-23T10:00:00Z",
  updated_at: "2026-02-23T10:00:00Z",
  ...overrides,
});

const entries: PromptLibraryEntry[] = [
  makeEntry({ id: 1, name: "Cinematic Portrait", usage_count: 42 }),
  makeEntry({ id: 2, name: "Landscape Panorama", usage_count: 15, tags: ["landscape"] }),
  makeEntry({ id: 3, name: "Abstract Art", usage_count: 8, tags: ["abstract", "art"] }),
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("PromptLibraryBrowser", () => {
  it("renders library entries", () => {
    renderWithProviders(
      <PromptLibraryBrowser entries={entries} />,
    );

    expect(screen.getByTestId("prompt-library-browser")).toBeInTheDocument();
    expect(screen.getByTestId("library-entry-1")).toBeInTheDocument();
    expect(screen.getByTestId("library-entry-2")).toBeInTheDocument();
    expect(screen.getByTestId("library-entry-3")).toBeInTheDocument();
  });

  it("shows the search input", () => {
    renderWithProviders(
      <PromptLibraryBrowser entries={entries} />,
    );

    expect(screen.getByTestId("library-search-input")).toBeInTheDocument();
  });

  it("shows empty state when no entries", () => {
    renderWithProviders(
      <PromptLibraryBrowser entries={[]} />,
    );

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(
      screen.getByText("No prompt library entries found."),
    ).toBeInTheDocument();
  });

  it("calls onSelect when select button is clicked", () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <PromptLibraryBrowser entries={entries} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByTestId("select-btn-1"));
    expect(onSelect).toHaveBeenCalledWith(entries[0]);
  });

  it("displays usage count for each entry", () => {
    renderWithProviders(
      <PromptLibraryBrowser entries={entries} />,
    );

    expect(screen.getByTestId("usage-1")).toHaveTextContent("Used: 42x");
    expect(screen.getByTestId("usage-2")).toHaveTextContent("Used: 15x");
  });

  it("fires onSearchChange when search input changes", () => {
    const onSearchChange = vi.fn();
    renderWithProviders(
      <PromptLibraryBrowser
        entries={entries}
        onSearchChange={onSearchChange}
      />,
    );

    fireEvent.change(screen.getByTestId("library-search-input"), {
      target: { value: "cinema" },
    });
    expect(onSearchChange).toHaveBeenCalledWith("cinema");
  });
});
