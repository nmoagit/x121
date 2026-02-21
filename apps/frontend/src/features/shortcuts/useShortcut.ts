/**
 * Convenience hook to register a single shortcut (PRD-52).
 *
 * Registers the binding on mount and unregisters on cleanup.
 *
 * @example
 * ```tsx
 * useShortcut({
 *   id: 'playback.playPause',
 *   key: 'Space',
 *   label: 'Play / Pause',
 *   category: 'playback',
 *   action: togglePlay,
 * }, [togglePlay]);
 * ```
 */

import { useEffect } from "react";

import type { ShortcutBinding } from "./ShortcutRegistry";
import { shortcutRegistry } from "./ShortcutRegistry";

/**
 * Register a keyboard shortcut for the lifetime of the component.
 *
 * @param binding - The shortcut binding configuration.
 * @param deps    - Dependency array; the binding is re-registered when deps change.
 */
export function useShortcut(
  binding: ShortcutBinding,
  deps: React.DependencyList = [],
): void {
  useEffect(() => {
    shortcutRegistry.register(binding);
    return () => {
      shortcutRegistry.unregister(binding.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding.id, ...deps]);
}
