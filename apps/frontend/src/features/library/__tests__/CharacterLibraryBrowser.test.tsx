import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { CharacterLibraryBrowser } from "../CharacterLibraryBrowser";
import type { LibraryCharacter } from "../types";

const MOCK_CHARACTERS: LibraryCharacter[] = [
  {
    id: 1,
    name: "Alice",
    project_id: 10,
    project_name: "Fantasy Project",
    group_name: null,
    hero_variant_id: null,
    scene_count: 3,
    image_count: 5,
    clip_count: 2,
    has_metadata: true,
    status_id: 1,
    is_enabled: true,
    created_at: "2026-02-22T10:00:00Z",
  },
  {
    id: 2,
    name: "Bob the Builder",
    project_id: 20,
    project_name: "Construction Project",
    group_name: "Workers",
    hero_variant_id: 42,
    scene_count: 0,
    image_count: 0,
    clip_count: 0,
    has_metadata: false,
    status_id: 2,
    is_enabled: true,
    created_at: "2026-02-22T11:00:00Z",
  },
];

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((_path: string) => {
      return Promise.resolve(MOCK_CHARACTERS);
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

  it("shows character cards in a grid", async () => {
    renderWithProviders(<CharacterLibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByTestId("library-grid")).toBeInTheDocument();
    });

    expect(screen.getByTestId("library-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("library-card-2")).toBeInTheDocument();
  });

  it("displays project name on cards", async () => {
    renderWithProviders(<CharacterLibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText("Fantasy Project")).toBeInTheDocument();
    });

    expect(screen.getByText(/Construction Project/)).toBeInTheDocument();
  });
});
