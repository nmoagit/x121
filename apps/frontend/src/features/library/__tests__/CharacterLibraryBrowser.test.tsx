import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { CharacterLibraryBrowser } from "../CharacterLibraryBrowser";
import type { LibraryCharacter } from "../types";

const MOCK_CHARACTERS: LibraryCharacter[] = [
  {
    id: 1,
    name: "Alice",
    source_character_id: null,
    source_project_id: null,
    master_metadata: { hair: "blonde" },
    tags: ["hero", "fantasy"],
    description: "A brave adventurer",
    thumbnail_path: null,
    is_published: true,
    created_by_id: 1,
    created_at: "2026-02-22T10:00:00Z",
    updated_at: "2026-02-22T10:00:00Z",
  },
  {
    id: 2,
    name: "Bob the Builder",
    source_character_id: null,
    source_project_id: null,
    master_metadata: {},
    tags: ["worker"],
    description: null,
    thumbnail_path: null,
    is_published: false,
    created_by_id: 1,
    created_at: "2026-02-22T11:00:00Z",
    updated_at: "2026-02-22T11:00:00Z",
  },
];

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path === "/library/characters") {
        return Promise.resolve(MOCK_CHARACTERS);
      }
      // Usage endpoints return empty arrays.
      if (path.includes("/usage")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("CharacterLibraryBrowser", () => {
  it("renders the library browser with characters", async () => {
    renderWithProviders(<CharacterLibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByTestId("library-browser")).toBeInTheDocument();
    });

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob the Builder")).toBeInTheDocument();
  });

  it("shows correct result count", async () => {
    renderWithProviders(<CharacterLibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText("2 characters")).toBeInTheDocument();
    });
  });

  it("filters characters by search query", async () => {
    renderWithProviders(<CharacterLibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByTestId("library-search")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("library-search");
    fireEvent.change(searchInput, { target: { value: "Alice" } });

    await waitFor(() => {
      expect(screen.getByText("1 character matching")).toBeInTheDocument();
    });

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob the Builder")).not.toBeInTheDocument();
  });

  it("shows character cards in a grid", async () => {
    renderWithProviders(<CharacterLibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByTestId("library-grid")).toBeInTheDocument();
    });

    expect(screen.getByTestId("library-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("library-card-2")).toBeInTheDocument();
  });
});
