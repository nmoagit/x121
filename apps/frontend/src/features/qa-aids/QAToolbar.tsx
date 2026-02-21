/**
 * QAToolbar — Floating toolbar aggregating all QA visual aid tools.
 *
 * Provides toggle buttons for Ghosting, ROI, Jog Dial, and Audio Scrub,
 * along with opacity/magnification controls. Can be positioned at
 * top, bottom, or as a free-floating panel.
 */

import { useCallback, useState } from "react";

import { cn } from "@/lib/cn";

import type { GhostMode } from "./GhostingOverlay";
import type { Magnification } from "./ROIZoomPanel";
import {
  Divider,
  MagnificationSelector,
  ModeToggle,
  OpacitySelector,
  ToolGroup,
  ToolToggle,
} from "./QAToolbarControls";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type ToolbarPosition = "top" | "bottom" | "floating";

export interface QAToolbarState {
  ghostingEnabled: boolean;
  ghostMode: GhostMode;
  ghostOpacity: number;
  roiEnabled: boolean;
  roiMagnification: Magnification;
  jogDialEnabled: boolean;
  audioScrubEnabled: boolean;
}

export interface QAToolbarProps {
  /** Current state of all tools. */
  state: QAToolbarState;
  /** Called when any tool state changes. */
  onStateChange: (state: QAToolbarState) => void;
  /** Toolbar position. Default: "bottom" */
  position?: ToolbarPosition;
  /** Additional className. */
  className?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

const POSITION_CLASSES: Record<ToolbarPosition, string> = {
  top: "fixed top-2 left-1/2 -translate-x-1/2 z-50",
  bottom: "fixed bottom-2 left-1/2 -translate-x-1/2 z-50",
  floating: "fixed bottom-16 right-4 z-50",
};

export function QAToolbar({
  state,
  onStateChange,
  position = "bottom",
  className,
}: QAToolbarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const update = useCallback(
    (partial: Partial<QAToolbarState>) => {
      onStateChange({ ...state, ...partial });
    },
    [state, onStateChange],
  );

  return (
    <div
      className={cn(
        POSITION_CLASSES[position],
        "rounded-[var(--radius-lg)]",
        "bg-[var(--color-surface-primary)]/95 backdrop-blur-sm",
        "border border-[var(--color-border-default)]",
        "shadow-[var(--shadow-lg)]",
        "transition-all duration-[var(--duration-normal)] ease-[var(--ease-default)]",
        className,
      )}
      data-testid="qa-toolbar"
    >
      {/* Collapse toggle */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
          QA Tools
        </span>
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            "w-5 h-5 flex items-center justify-center rounded-[var(--radius-sm)]",
            "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            "transition-colors duration-[var(--duration-fast)]",
          )}
          aria-label={isCollapsed ? "Expand QA toolbar" : "Collapse QA toolbar"}
        >
          {isCollapsed ? "+" : "-"}
        </button>
      </div>

      {!isCollapsed && (
        <div className="flex items-center gap-1 px-3 pb-2 flex-wrap">
          {/* Ghosting controls */}
          <ToolGroup label="Ghost">
            <ToolToggle
              active={state.ghostingEnabled}
              onClick={() => update({ ghostingEnabled: !state.ghostingEnabled })}
              label="Ghost"
            />
            {state.ghostingEnabled && (
              <>
                <ModeToggle
                  mode={state.ghostMode}
                  onModeChange={(mode) => update({ ghostMode: mode })}
                />
                <OpacitySelector
                  value={state.ghostOpacity}
                  onChange={(opacity) => update({ ghostOpacity: opacity })}
                />
              </>
            )}
          </ToolGroup>

          <Divider />

          {/* ROI controls */}
          <ToolGroup label="ROI">
            <ToolToggle
              active={state.roiEnabled}
              onClick={() => update({ roiEnabled: !state.roiEnabled })}
              label="ROI"
            />
            {state.roiEnabled && (
              <MagnificationSelector
                value={state.roiMagnification}
                onChange={(mag) => update({ roiMagnification: mag })}
              />
            )}
          </ToolGroup>

          <Divider />

          {/* Jog Dial toggle */}
          <ToolToggle
            active={state.jogDialEnabled}
            onClick={() => update({ jogDialEnabled: !state.jogDialEnabled })}
            label="Jog"
          />

          <Divider />

          {/* Audio Scrub toggle */}
          <ToolToggle
            active={state.audioScrubEnabled}
            onClick={() => update({ audioScrubEnabled: !state.audioScrubEnabled })}
            label="Scrub"
          />
        </div>
      )}
    </div>
  );
}
