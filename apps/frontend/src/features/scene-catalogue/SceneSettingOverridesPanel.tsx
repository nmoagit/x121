/**
 * Shared overrides panel for scene settings at group and character level.
 *
 * Renders a table of expanded scene settings with toggle, source badge,
 * reset actions, and a "Reset All" modal. Both GroupSceneOverrides and
 * CharacterSceneOverrides delegate to this component.
 */

import { useCallback, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";

import { Card, Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, LoadingPane } from "@/components/primitives";

import { SceneSettingRow } from "./SceneSettingRow";
import { useExpandedSettings } from "./hooks/use-expanded-settings";
import type { EffectiveSceneSetting, SceneSettingUpdate } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SceneSettingOverridesPanelProps {
  /** Effective settings from the query hook. */
  settings: EffectiveSceneSetting[] | undefined;
  /** Whether the settings query is loading. */
  isLoading: boolean;
  /** The source value that marks this level's overrides (e.g. "group" or "character"). */
  sourceName: EffectiveSceneSetting["source"];
  /** Human-readable label for this entity level (e.g. "group" or "character"). */
  entityLabel: string;
  /** Mutation for toggling a setting. */
  toggleMutation: UseMutationResult<unknown, unknown, SceneSettingUpdate>;
  /** Mutation for removing an override. */
  removeMutation: UseMutationResult<unknown, unknown, { sceneTypeId: number; trackId: number | null }>;
  /** Optional map of "scene_type_id::track_id" → video count. */
  videoCountMap?: Map<string, number>;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SceneSettingOverridesPanel({
  settings,
  isLoading,
  sourceName,
  entityLabel,
  toggleMutation,
  removeMutation,
  videoCountMap,
}: SceneSettingOverridesPanelProps) {
  const expandedRows = useExpandedSettings(settings);
  const [showResetAll, setShowResetAll] = useState(false);

  const hasOverrides = settings?.some((s) => s.source === sourceName);

  const handleToggle = useCallback(
    (sceneTypeId: number, trackId: number | null, enabled: boolean) => {
      toggleMutation.mutate({
        scene_type_id: sceneTypeId,
        track_id: trackId,
        is_enabled: enabled,
      });
    },
    [toggleMutation],
  );

  const handleReset = useCallback(
    (sceneTypeId: number, trackId: number | null) => {
      removeMutation.mutate({ sceneTypeId, trackId });
    },
    [removeMutation],
  );

  const handleResetAll = useCallback(() => {
    if (!settings) return;

    const overrides = settings.filter((s) => s.source === sourceName);
    for (const override of overrides) {
      removeMutation.mutate({ sceneTypeId: override.scene_type_id, trackId: override.track_id });
    }
    setShowResetAll(false);
  }, [settings, sourceName, removeMutation]);

  if (isLoading) {
    return <LoadingPane />;
  }

  const isPending = toggleMutation.isPending || removeMutation.isPending;

  return (
    <Stack gap={4}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            Scene Settings
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Override scene settings for this {entityLabel}. Inherits from project and catalogue
            defaults.
          </p>
        </div>
        {hasOverrides && (
          <Button variant="secondary" size="sm" onClick={() => setShowResetAll(true)}>
            Reset All Overrides
          </Button>
        )}
      </div>

      <Card elevation="sm" padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                  Scene
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                  Track
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                  Enabled
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                  Source
                </th>
                {videoCountMap && (
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                    Videos
                  </th>
                )}
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {expandedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={videoCountMap ? 6 : 5}
                    className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                  >
                    No scene settings available.
                  </td>
                </tr>
              ) : (
                expandedRows.map((row) => (
                  <SceneSettingRow
                    key={`${row.scene_type_id}-${row.track_id ?? "none"}`}
                    row={row}
                    onToggle={handleToggle}
                    isPending={isPending}
                    hasVideo={videoCountMap ? (videoCountMap.get(`${row.scene_type_id}::${row.track_id ?? ""}`) ?? 0) > 0 : undefined}
                    actions={
                      row.source === sourceName ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReset(row.scene_type_id, row.track_id)}
                          disabled={isPending}
                        >
                          Reset
                        </Button>
                      ) : undefined
                    }
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Reset all confirmation */}
      <Modal
        open={showResetAll}
        onClose={() => setShowResetAll(false)}
        title={`Reset All ${entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1)} Overrides`}
        size="sm"
      >
        <Stack gap={4}>
          <p className="text-sm text-[var(--color-text-secondary)]">
            This will remove all {entityLabel}-level scene setting overrides. Settings will fall
            back to project and catalogue defaults.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowResetAll(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleResetAll}
              loading={removeMutation.isPending}
            >
              Reset All
            </Button>
          </div>
        </Stack>
      </Modal>
    </Stack>
  );
}
