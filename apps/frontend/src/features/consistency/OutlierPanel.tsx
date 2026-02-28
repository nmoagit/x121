/**
 * Outlier scene panel for character consistency (PRD-94).
 *
 * Lists scenes identified as outliers with their IDs, and provides
 * a re-queue action per outlier.
 */

import { Badge, Button } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface OutlierPanelProps {
  outlierSceneIds: number[] | null;
  sceneLabels?: Record<number, string>;
  onRequeue?: (sceneId: number) => void;
}

export function OutlierPanel({
  outlierSceneIds,
  sceneLabels = {},
  onRequeue,
}: OutlierPanelProps) {
  const outliers = outlierSceneIds ?? [];
  const isEmpty = outliers.length === 0;

  return (
    <div data-testid="outlier-panel">
      <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-2">
        Outlier Scenes
      </h3>

      {isEmpty && (
        <p
          data-testid="outlier-empty"
          className="text-sm text-[var(--color-text-muted)]"
        >
          No outliers detected.
        </p>
      )}

      {!isEmpty && (
        <ul className="space-y-2">
          {outliers.map((sceneId) => (
            <li
              key={sceneId}
              data-testid={`outlier-${sceneId}`}
              className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Badge variant="danger" size="sm">
                  Outlier
                </Badge>
                <span className="text-sm text-[var(--color-text-primary)]">
                  {sceneLabels[sceneId] ?? `Scene #${sceneId}`}
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                data-testid={`requeue-btn-${sceneId}`}
                onClick={() => onRequeue?.(sceneId)}
              >
                Re-queue
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
