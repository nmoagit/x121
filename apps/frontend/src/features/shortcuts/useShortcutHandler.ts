/**
 * Global keydown listener that dispatches to the ShortcutRegistry (PRD-52).
 *
 * Call this hook once at the application root. It:
 * 1. Normalises the key combo from the KeyboardEvent.
 * 2. Determines the active context (panel) from the DOM.
 * 3. Looks up the matching binding in the registry.
 * 4. Invokes the action and calls `preventDefault`.
 * 5. Skips when focus is inside an input, textarea, or contenteditable.
 */

import { useEffect } from "react";

import { normalizeKeyCombo } from "./normalizeKeyCombo";
import { shortcutRegistry } from "./ShortcutRegistry";

/** Tags that indicate the user is typing text, not issuing shortcuts. */
const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Returns `true` if the event target is inside an editable element
 * where shortcuts should not fire.
 */
function isEditableTarget(e: KeyboardEvent): boolean {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return false;
  if (INPUT_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return false;
}

/** Resolve the shortcut context from the event target's DOM ancestry. */
function getContextFromEvent(e: KeyboardEvent): string | null {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return null;
  const contextEl = target.closest("[data-shortcut-context]");
  if (contextEl instanceof HTMLElement) {
    return contextEl.dataset.shortcutContext ?? null;
  }
  return null;
}

/**
 * Mount a global keyboard shortcut listener.
 *
 * Should be called once near the root of the component tree.
 */
export function useShortcutHandler(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Never intercept when the user is typing text.
      if (isEditableTarget(e)) return;

      const combo = normalizeKeyCombo(e);
      if (!combo) return;

      const context = getContextFromEvent(e);
      const binding = shortcutRegistry.getShortcutForKey(combo, context);

      if (binding) {
        e.preventDefault();
        e.stopPropagation();
        binding.action();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
