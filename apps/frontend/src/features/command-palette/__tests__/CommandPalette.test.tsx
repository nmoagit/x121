import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { CommandPalette } from "../CommandPalette";
import { commandRegistry } from "../commandRegistry";

// Mock the api module.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([
      {
        id: 1,
        user_id: 1,
        entity_type: "project",
        entity_id: 42,
        access_count: 5,
        last_accessed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("CommandPalette", () => {
  it("opens and closes with keyboard shortcut", async () => {
    renderWithProviders(<CommandPalette />);

    // Initially not visible
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();

    // Open with Ctrl+K
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });

    // Close with Escape
    const input = screen.getByTestId("command-palette-input");
    fireEvent.keyDown(input.closest("[data-testid='command-palette']")!, {
      key: "Escape",
    });
    await waitFor(() => {
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    });
  });

  it("shows recent items when query is empty", async () => {
    renderWithProviders(<CommandPalette />);

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId("recent-items-list")).toBeInTheDocument();
    });

    expect(screen.getByText("Recent")).toBeInTheDocument();
  });

  it("updates results as user types", async () => {
    // Register a test command
    commandRegistry.register({
      id: "test.command",
      label: "Test Command Alpha",
      category: "testing",
      execute: vi.fn(),
    });

    renderWithProviders(<CommandPalette />);

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId("command-palette-input")).toBeInTheDocument();
    });

    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "Alpha" } });

    await waitFor(() => {
      const results = screen.getAllByTestId("palette-result-item");
      expect(results.length).toBeGreaterThan(0);
    });

    // Clean up
    commandRegistry.unregister("test.command");
  });

  it("switches between category tabs", async () => {
    renderWithProviders(<CommandPalette />);

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId("category-tabs")).toBeInTheDocument();
    });

    const commandsTab = screen.getByTestId("category-tab-commands");
    fireEvent.click(commandsTab);

    // The commands tab should now be the active one
    expect(commandsTab).toHaveClass("text-[var(--color-text-primary)]");
  });
});
