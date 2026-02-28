/**
 * Hook for screen-share mode with keyboard shortcut (PRD-82).
 */

import { useShortcut } from "@/features/shortcuts/useShortcut";

import { useSensitivity } from "../SensitivityProvider";

export function useScreenShareMode() {
  const { screenShareMode, toggleScreenShareMode } = useSensitivity();

  useShortcut(
    {
      id: "general.screenShareMode",
      key: "Ctrl+Shift+s",
      label: "Toggle Screen-Share Mode",
      category: "general",
      action: toggleScreenShareMode,
    },
    [toggleScreenShareMode],
  );

  return {
    isActive: screenShareMode,
    toggle: toggleScreenShareMode,
  };
}
