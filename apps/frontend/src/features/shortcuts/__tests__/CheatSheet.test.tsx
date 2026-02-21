import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { CheatSheet } from "../CheatSheet";

// We need to import and reset the singleton for each test.
import { shortcutRegistry } from "../ShortcutRegistry";

beforeEach(() => {
  shortcutRegistry.reset();
});

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("CheatSheet", () => {
  function registerTestBindings() {
    shortcutRegistry.register({
      id: "playback.playPause",
      key: "Space",
      label: "Play / Pause",
      category: "playback",
      action: () => {},
    });
    shortcutRegistry.register({
      id: "general.save",
      key: "Ctrl+s",
      label: "Save",
      category: "general",
      action: () => {},
    });
    shortcutRegistry.register({
      id: "navigation.nextItem",
      key: "ArrowDown",
      label: "Next Item",
      category: "navigation",
      action: () => {},
    });
  }

  /** Helper: open the cheat sheet via its registered action. */
  function openCheatSheet() {
    const binding = shortcutRegistry.getShortcutForKey("?");
    expect(binding).not.toBeNull();
    act(() => {
      binding?.action();
    });
  }

  it("is hidden by default", () => {
    registerTestBindings();
    render(<CheatSheet />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens when the registered action fires", () => {
    render(<CheatSheet />);
    registerTestBindings();

    openCheatSheet();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders shortcuts grouped by category", () => {
    render(<CheatSheet />);
    registerTestBindings();

    openCheatSheet();

    expect(screen.getByText("Playback")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Navigation")).toBeInTheDocument();

    expect(screen.getByText("Play / Pause")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Next Item")).toBeInTheDocument();
  });

  it("shows custom bindings with different styling", () => {
    render(<CheatSheet />);
    registerTestBindings();

    shortcutRegistry.setCustomBinding("playback.playPause", "p");

    openCheatSheet();

    // The custom binding value should be visible.
    expect(screen.getByText("p")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<CheatSheet />);

    openCheatSheet();

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Press Escape.
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
