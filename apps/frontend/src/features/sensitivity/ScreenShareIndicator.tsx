/**
 * Screen-share mode indicator banner (PRD-82).
 *
 * Displays a prominent banner at the top of the viewport when
 * screen-share mode is active. Includes a dismiss button with
 * keyboard shortcut hint.
 */

import { cn } from "@/lib/cn";
import { Monitor, X } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { useSensitivity } from "./SensitivityProvider";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ScreenShareIndicator() {
  const { screenShareMode, toggleScreenShareMode } = useSensitivity();

  if (!screenShareMode) return null;

  return (
    <div
      data-testid="screen-share-indicator"
      className={cn(
        "fixed top-0 inset-x-0 z-50",
        "flex items-center justify-center gap-2 px-4 py-2",
        "bg-[var(--color-action-danger)] text-[var(--color-text-inverse)]",
        "text-sm font-medium",
      )}
    >
      <Monitor size={iconSizes.sm} aria-hidden="true" />
      <span>Screen-Share Mode Active</span>
      <span className="text-xs opacity-75 ml-2">(Ctrl+Shift+S to toggle)</span>
      <button
        type="button"
        onClick={toggleScreenShareMode}
        className={cn(
          "ml-4 p-1 rounded-[var(--radius-sm)]",
          "hover:bg-white/20 transition-colors",
        )}
        aria-label="Exit screen-share mode"
      >
        <X size={iconSizes.sm} aria-hidden="true" />
      </button>
    </div>
  );
}
