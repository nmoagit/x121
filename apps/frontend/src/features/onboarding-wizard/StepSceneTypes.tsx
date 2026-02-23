/**
 * Step 5: Scene Type Selection — choose scene types for the batch (PRD-67).
 *
 * Allows users to select which scene types to apply to the batch of
 * characters. Each selected scene type will be generated for each character.
 */

import { Badge } from "@/components";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface StepSceneTypesProps {
  /** Current step data from the session. */
  stepData: Record<string, unknown>;
  /** Callback to update step data. */
  onUpdateStepData: (data: Record<string, unknown>) => void;
}

/** Placeholder scene types for demo purposes. */
const AVAILABLE_SCENE_TYPES = [
  { id: 1, name: "Portrait" },
  { id: 2, name: "Full Body" },
  { id: 3, name: "Action Pose" },
  { id: 4, name: "Sitting" },
  { id: 5, name: "Walking" },
  { id: 6, name: "Close-Up" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StepSceneTypes({
  stepData,
  onUpdateStepData,
}: StepSceneTypesProps) {
  const selectedIds = (stepData.scene_types as number[] | undefined) ?? [];
  const hasSelection = selectedIds.length > 0;

  function handleToggle(id: number) {
    const updated = selectedIds.includes(id)
      ? selectedIds.filter((sid) => sid !== id)
      : [...selectedIds, id];
    onUpdateStepData({ ...stepData, scene_types: updated });
  }

  function handleSelectAll() {
    onUpdateStepData({
      ...stepData,
      scene_types: AVAILABLE_SCENE_TYPES.map((st) => st.id),
    });
  }

  function handleDeselectAll() {
    onUpdateStepData({ ...stepData, scene_types: [] });
  }

  return (
    <div data-testid="step-scene-types" className="space-y-4">
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Scene Type Selection
      </h3>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Select which scene types to generate for all characters in this batch.
      </p>

      {/* Bulk actions */}
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="select-all-btn"
          className="text-xs font-medium text-[var(--color-action-primary)]"
          onClick={handleSelectAll}
        >
          Select All
        </button>
        <button
          type="button"
          data-testid="deselect-all-btn"
          className="text-xs font-medium text-[var(--color-text-muted)]"
          onClick={handleDeselectAll}
        >
          Deselect All
        </button>
      </div>

      {/* Scene type grid */}
      <div
        data-testid="scene-type-grid"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {AVAILABLE_SCENE_TYPES.map((st) => {
          const isSelected = selectedIds.includes(st.id);
          return (
            <button
              key={st.id}
              type="button"
              data-testid={`scene-type-${st.id}`}
              className={`rounded border p-3 text-left text-sm transition-colors ${
                isSelected
                  ? "border-[var(--color-action-primary)] bg-[var(--color-surface-secondary)] font-medium text-[var(--color-text-primary)]"
                  : "border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]"
              }`}
              onClick={() => handleToggle(st.id)}
            >
              <span className="mr-2">{isSelected ? "\u2611" : "\u2610"}</span>
              {st.name}
            </button>
          );
        })}
      </div>

      {/* Status */}
      <div data-testid="scene-type-status">
        {hasSelection ? (
          <Badge variant="success" size="sm">
            {selectedIds.length} scene type(s) selected
          </Badge>
        ) : (
          <Badge variant="default" size="sm">
            Select at least one scene type to continue
          </Badge>
        )}
      </div>
    </div>
  );
}
