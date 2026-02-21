/**
 * QAToolbarControls — Sub-components for the QA toolbar.
 *
 * Extracted from QAToolbar.tsx to keep file sizes manageable.
 * These are small, focused UI elements used only within QAToolbar.
 */

import { cn } from "@/lib/cn";
import { Button } from "@/components/primitives";

import type { GhostMode } from "./GhostingOverlay";
import type { Magnification } from "./ROIZoomPanel";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const OPACITY_PRESETS = [0.25, 0.5, 0.75] as const;
const MAGNIFICATION_PRESETS: Magnification[] = [2, 4, 8];

/* --------------------------------------------------------------------------
   ToolGroup
   -------------------------------------------------------------------------- */

export function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------------------
   ToolToggle
   -------------------------------------------------------------------------- */

export function ToolToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      variant={active ? "primary" : "ghost"}
      size="sm"
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </Button>
  );
}

/* --------------------------------------------------------------------------
   ModeToggle
   -------------------------------------------------------------------------- */

export function ModeToggle({
  mode,
  onModeChange,
}: {
  mode: GhostMode;
  onModeChange: (mode: GhostMode) => void;
}) {
  return (
    <div className="flex items-center rounded-[var(--radius-md)] overflow-hidden border border-[var(--color-border-default)]">
      <button
        type="button"
        onClick={() => onModeChange("previous")}
        className={cn(
          "px-2 py-1 text-xs transition-colors duration-[var(--duration-fast)]",
          mode === "previous"
            ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
            : "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]",
        )}
      >
        Prev
      </button>
      <button
        type="button"
        onClick={() => onModeChange("next")}
        className={cn(
          "px-2 py-1 text-xs transition-colors duration-[var(--duration-fast)]",
          mode === "next"
            ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
            : "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]",
        )}
      >
        Next
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------------
   OpacitySelector
   -------------------------------------------------------------------------- */

export function OpacitySelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (opacity: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {OPACITY_PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => onChange(preset)}
          className={cn(
            "px-1.5 py-0.5 text-xs rounded-[var(--radius-sm)]",
            "transition-colors duration-[var(--duration-fast)]",
            Math.abs(value - preset) < 0.01
              ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]",
          )}
          aria-label={`${preset * 100}% opacity`}
        >
          {preset * 100}%
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   MagnificationSelector
   -------------------------------------------------------------------------- */

export function MagnificationSelector({
  value,
  onChange,
}: {
  value: Magnification;
  onChange: (mag: Magnification) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {MAGNIFICATION_PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => onChange(preset)}
          className={cn(
            "px-1.5 py-0.5 text-xs rounded-[var(--radius-sm)]",
            "transition-colors duration-[var(--duration-fast)]",
            value === preset
              ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]",
          )}
          aria-label={`${preset}x magnification`}
        >
          {preset}x
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Divider
   -------------------------------------------------------------------------- */

export function Divider() {
  return (
    <div className="w-px h-5 bg-[var(--color-border-default)] mx-1" aria-hidden="true" />
  );
}
