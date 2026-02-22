import { describe, expect, it, vi } from "vitest";

import { CommandRegistry } from "../commandRegistry";
import type { PaletteCommand } from "../types";

function makeCommand(overrides: Partial<PaletteCommand> = {}): PaletteCommand {
  return {
    id: "test-cmd",
    label: "Test Command",
    category: "general",
    execute: vi.fn(),
    ...overrides,
  };
}

describe("CommandRegistry", () => {
  it("registers and unregisters commands", () => {
    const registry = new CommandRegistry();
    const cmd = makeCommand({ id: "nav.home" });

    registry.register(cmd);
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getAll()[0]!.id).toBe("nav.home");

    registry.unregister("nav.home");
    expect(registry.getAll()).toHaveLength(0);
  });

  it("search returns matching commands", () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand({ id: "a", label: "Open Settings" }));
    registry.register(makeCommand({ id: "b", label: "Open Project" }));
    registry.register(makeCommand({ id: "c", label: "Close Tab" }));

    const results = registry.search("open");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toContain("a");
    expect(results.map((r) => r.id)).toContain("b");
  });

  it("getByCategory filters correctly", () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand({ id: "a", category: "navigation" }));
    registry.register(makeCommand({ id: "b", category: "navigation" }));
    registry.register(makeCommand({ id: "c", category: "editing" }));

    const navCommands = registry.getByCategory("navigation");
    expect(navCommands).toHaveLength(2);
    expect(navCommands.every((c) => c.category === "navigation")).toBe(true);
  });

  it("fuzzy matching works on label and category", () => {
    const registry = new CommandRegistry();
    registry.register(
      makeCommand({ id: "a", label: "Toggle Dark Mode", category: "theme" }),
    );
    registry.register(
      makeCommand({ id: "b", label: "Open File", category: "file" }),
    );

    // Matches by category
    const themeResults = registry.search("theme");
    expect(themeResults).toHaveLength(1);
    expect(themeResults[0]!.id).toBe("a");

    // Matches by label substring
    const darkResults = registry.search("dark");
    expect(darkResults).toHaveLength(1);
    expect(darkResults[0]!.id).toBe("a");
  });
});
