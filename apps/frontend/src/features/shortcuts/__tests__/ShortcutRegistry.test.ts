import { describe, it, expect, beforeEach } from "vitest";

import { ShortcutRegistry } from "../ShortcutRegistry";
import type { ShortcutBinding } from "../ShortcutRegistry";
import { normalizeKeyCombo } from "../normalizeKeyCombo";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function makeBinding(overrides: Partial<ShortcutBinding> = {}): ShortcutBinding {
  return {
    id: "test.action",
    key: "Space",
    label: "Test Action",
    category: "general",
    action: () => {},
    ...overrides,
  };
}

function makeKeyEvent(
  key: string,
  mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {},
): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
    metaKey: mods.meta ?? false,
  });
}

/* --------------------------------------------------------------------------
   ShortcutRegistry tests
   -------------------------------------------------------------------------- */

describe("ShortcutRegistry", () => {
  let registry: ShortcutRegistry;

  beforeEach(() => {
    registry = new ShortcutRegistry();
  });

  it("registers and retrieves a binding by key", () => {
    const binding = makeBinding({ id: "playback.playPause", key: "Space" });
    registry.register(binding);

    const found = registry.getShortcutForKey("Space");
    expect(found).not.toBeNull();
    expect(found?.id).toBe("playback.playPause");
  });

  it("unregisters a binding", () => {
    const binding = makeBinding({ id: "playback.playPause", key: "Space" });
    registry.register(binding);
    registry.unregister("playback.playPause");

    const found = registry.getShortcutForKey("Space");
    expect(found).toBeNull();
  });

  it("resolves preset bindings", () => {
    registry.setPreset("default");
    const binding = makeBinding({ id: "playback.playPause", key: "X" });
    registry.register(binding);

    // Default preset maps playback.playPause to Space.
    const resolved = registry.getResolvedBinding("playback.playPause");
    expect(resolved).toBe("Space");
  });

  it("custom overrides take precedence over preset", () => {
    registry.setPreset("default");
    const binding = makeBinding({ id: "playback.playPause", key: "X" });
    registry.register(binding);
    registry.setCustomBinding("playback.playPause", "p");

    const resolved = registry.getResolvedBinding("playback.playPause");
    expect(resolved).toBe("p");
  });

  it("removing custom override falls back to preset", () => {
    registry.setPreset("default");
    const binding = makeBinding({ id: "playback.playPause", key: "X" });
    registry.register(binding);
    registry.setCustomBinding("playback.playPause", "p");
    registry.removeCustomBinding("playback.playPause");

    const resolved = registry.getResolvedBinding("playback.playPause");
    expect(resolved).toBe("Space");
  });

  it("detects conflicts for the same key", () => {
    registry.register(makeBinding({ id: "a", key: "Space", category: "general" }));
    registry.register(makeBinding({ id: "b", key: "Space", category: "playback" }));

    const conflicts = registry.getConflicts("Space");
    expect(conflicts).toHaveLength(2);
  });

  it("context-aware: same key in different contexts", () => {
    registry.register(
      makeBinding({ id: "review.approve", key: "Enter", context: "review-panel" }),
    );
    registry.register(
      makeBinding({ id: "general.confirm", key: "Enter", context: "settings-panel" }),
    );

    const inReview = registry.getShortcutForKey("Enter", "review-panel");
    expect(inReview?.id).toBe("review.approve");

    const inSettings = registry.getShortcutForKey("Enter", "settings-panel");
    expect(inSettings?.id).toBe("general.confirm");
  });

  it("global binding matches regardless of context", () => {
    registry.register(
      makeBinding({ id: "general.save", key: "Ctrl+s", context: null }),
    );

    const found = registry.getShortcutForKey("Ctrl+s", "any-panel");
    expect(found?.id).toBe("general.save");
  });

  it("getAllBindings filters by context", () => {
    registry.register(makeBinding({ id: "a", key: "a", context: "panel-a" }));
    registry.register(makeBinding({ id: "b", key: "b", context: "panel-b" }));
    registry.register(makeBinding({ id: "c", key: "c", context: null }));

    const panelA = registry.getAllBindings("panel-a");
    const ids = panelA.map((b) => b.id);
    expect(ids).toContain("a");
    expect(ids).toContain("c");
    expect(ids).not.toContain("b");
  });

  it("setAllCustomOverrides replaces all overrides", () => {
    registry.setCustomBinding("a", "x");
    registry.setAllCustomOverrides({ b: "y", c: "z" });

    const overrides = registry.getCustomOverrides();
    expect(overrides).toEqual({ b: "y", c: "z" });
    expect(overrides).not.toHaveProperty("a");
  });

  it("reset clears everything", () => {
    registry.register(makeBinding({ id: "a", key: "a" }));
    registry.setCustomBinding("a", "x");
    registry.setPreset("premiere");

    registry.reset();

    expect(registry.getAllBindings()).toHaveLength(0);
    expect(registry.getActivePreset()).toBe("default");
    expect(registry.getCustomOverrides()).toEqual({});
  });
});

/* --------------------------------------------------------------------------
   normalizeKeyCombo tests
   -------------------------------------------------------------------------- */

describe("normalizeKeyCombo", () => {
  it("returns Space for spacebar", () => {
    const result = normalizeKeyCombo(makeKeyEvent(" "));
    expect(result).toBe("Space");
  });

  it("returns null for standalone modifier keys", () => {
    expect(normalizeKeyCombo(makeKeyEvent("Control"))).toBeNull();
    expect(normalizeKeyCombo(makeKeyEvent("Shift"))).toBeNull();
    expect(normalizeKeyCombo(makeKeyEvent("Alt"))).toBeNull();
    expect(normalizeKeyCombo(makeKeyEvent("Meta"))).toBeNull();
  });

  it("normalises Ctrl+z", () => {
    const result = normalizeKeyCombo(makeKeyEvent("z", { ctrl: true }));
    expect(result).toBe("Ctrl+z");
  });

  it("normalises Ctrl+Shift+z", () => {
    const result = normalizeKeyCombo(
      makeKeyEvent("z", { ctrl: true, shift: true }),
    );
    expect(result).toBe("Ctrl+Shift+z");
  });

  it("treats metaKey as Ctrl", () => {
    const result = normalizeKeyCombo(makeKeyEvent("z", { meta: true }));
    expect(result).toBe("Ctrl+z");
  });

  it("returns arrow keys correctly", () => {
    expect(normalizeKeyCombo(makeKeyEvent("ArrowRight"))).toBe("ArrowRight");
    expect(normalizeKeyCombo(makeKeyEvent("ArrowLeft"))).toBe("ArrowLeft");
    expect(normalizeKeyCombo(makeKeyEvent("ArrowUp"))).toBe("ArrowUp");
    expect(normalizeKeyCombo(makeKeyEvent("ArrowDown"))).toBe("ArrowDown");
  });

  it("handles Shift+ArrowRight", () => {
    const result = normalizeKeyCombo(
      makeKeyEvent("ArrowRight", { shift: true }),
    );
    expect(result).toBe("Shift+ArrowRight");
  });

  it("normalises Escape", () => {
    expect(normalizeKeyCombo(makeKeyEvent("Escape"))).toBe("Escape");
  });

  it("normalises single letter keys", () => {
    expect(normalizeKeyCombo(makeKeyEvent("f"))).toBe("f");
    expect(normalizeKeyCombo(makeKeyEvent("k"))).toBe("k");
  });

  it("normalises Delete key", () => {
    expect(normalizeKeyCombo(makeKeyEvent("Delete"))).toBe("Delete");
  });
});
