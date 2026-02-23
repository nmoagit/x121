/**
 * Per-reviewer annotation layer toggling (PRD-70).
 *
 * Lists all unique annotators for a segment and provides visibility
 * toggles for each reviewer's annotation layer.
 */

import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";

import type { AnnotationLayer } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface AnnotationLayersProps {
  /** List of annotation layers (one per reviewer). */
  layers: AnnotationLayer[];
  /** Current authenticated user ID for "Show Mine Only" toggle. */
  currentUserId?: number;
  /** Called when a layer's visibility is toggled. */
  onToggleLayer?: (userId: number, visible: boolean) => void;
  /** Called when "Show All" is clicked. */
  onShowAll?: () => void;
  /** Called when "Show Mine Only" is clicked. */
  onShowMineOnly?: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AnnotationLayers({
  layers,
  currentUserId,
  onToggleLayer,
  onShowAll,
  onShowMineOnly,
}: AnnotationLayersProps) {
  return (
    <div className="flex flex-col gap-2" data-testid="annotation-layers">
      {/* Quick toggle buttons */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onShowAll}
          data-testid="show-all-button"
        >
          Show All
        </Button>
        {currentUserId != null && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onShowMineOnly}
            data-testid="show-mine-button"
          >
            Show Mine Only
          </Button>
        )}
      </div>

      {/* Layer list */}
      {layers.length === 0 && (
        <p className="py-4 text-center text-sm text-[var(--color-text-muted)]">
          No annotations yet.
        </p>
      )}

      {layers.map((layer) => (
        <div
          key={layer.userId}
          className="flex items-center justify-between rounded border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2"
          data-testid={`layer-${layer.userId}`}
        >
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={layer.visible}
              onChange={(e) =>
                onToggleLayer?.(layer.userId, e.target.checked)
              }
              className="h-4 w-4"
              aria-label={`Toggle ${layer.userName}'s annotations`}
              data-testid={`layer-toggle-${layer.userId}`}
            />
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {layer.userName}
            </span>
          </div>
          <Badge variant="default" size="sm">
            {layer.annotations.length}
          </Badge>
        </div>
      ))}
    </div>
  );
}
