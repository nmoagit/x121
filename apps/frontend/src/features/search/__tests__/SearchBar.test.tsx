import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { SearchBar } from "../SearchBar";

// Mock the api module to prevent real HTTP requests.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/search/typeahead")) {
        return Promise.resolve([
          {
            entity_type: "character",
            entity_id: 1,
            name: "Alice Wonderland",
            rank: 0.9,
          },
          {
            entity_type: "project",
            entity_id: 2,
            name: "Animated Shorts",
            rank: 0.7,
          },
          {
            entity_type: "scene_type",
            entity_id: 3,
            name: "Action Sequence",
            rank: 0.5,
          },
        ]);
      }
      return Promise.resolve([]);
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("SearchBar", () => {
  it("renders the search input", () => {
    renderWithProviders(<SearchBar />);
    expect(
      screen.getByPlaceholderText("Search characters, projects, scenes..."),
    ).toBeInTheDocument();
  });

  it("accepts custom placeholder text", () => {
    renderWithProviders(<SearchBar placeholder="Find something..." />);
    expect(
      screen.getByPlaceholderText("Find something..."),
    ).toBeInTheDocument();
  });

  it("shows typeahead results after typing", async () => {
    renderWithProviders(<SearchBar />);

    const input = screen.getByPlaceholderText(
      "Search characters, projects, scenes...",
    );
    fireEvent.change(input, { target: { value: "ali" } });

    await waitFor(
      () => {
        expect(screen.getByText("Alice Wonderland")).toBeInTheDocument();
        expect(screen.getByText("Animated Shorts")).toBeInTheDocument();
        expect(screen.getByText("Action Sequence")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("shows entity type badges for results", async () => {
    renderWithProviders(<SearchBar />);

    const input = screen.getByPlaceholderText(
      "Search characters, projects, scenes...",
    );
    fireEvent.change(input, { target: { value: "ali" } });

    await waitFor(
      () => {
        expect(screen.getByText("Character")).toBeInTheDocument();
        expect(screen.getByText("Project")).toBeInTheDocument();
        expect(screen.getByText("Scene Type")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("calls onResultSelect when a result is clicked", async () => {
    const onSelect = vi.fn();
    renderWithProviders(<SearchBar onResultSelect={onSelect} />);

    const input = screen.getByPlaceholderText(
      "Search characters, projects, scenes...",
    );
    fireEvent.change(input, { target: { value: "ali" } });

    await waitFor(
      () => {
        expect(screen.getByText("Alice Wonderland")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    fireEvent.mouseDown(screen.getByText("Alice Wonderland"));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: "character",
        entity_id: 1,
        name: "Alice Wonderland",
      }),
    );
  });

  it("has correct ARIA attributes", () => {
    renderWithProviders(<SearchBar />);

    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-label", "Search");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
  });

  it("closes dropdown on Escape key", async () => {
    renderWithProviders(<SearchBar />);

    const input = screen.getByPlaceholderText(
      "Search characters, projects, scenes...",
    );
    fireEvent.change(input, { target: { value: "ali" } });

    await waitFor(
      () => {
        expect(screen.getByText("Alice Wonderland")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText("Alice Wonderland")).not.toBeInTheDocument();
    });
  });

  it("does not show results when query is less than 2 characters", () => {
    renderWithProviders(<SearchBar />);

    const input = screen.getByPlaceholderText(
      "Search characters, projects, scenes...",
    );
    fireEvent.change(input, { target: { value: "a" } });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
