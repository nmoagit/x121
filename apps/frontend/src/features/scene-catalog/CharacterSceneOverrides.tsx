/**
 * Character-level scene setting overrides panel (PRD-111).
 *
 * Shows the three-level merged scene settings expanded by track, with
 * toggle switches, source badges, and reset actions. Each scene_type × track
 * combination is a separate row. Toggles and resets operate at the
 * scene_type level (backend granularity).
 */

import { useCallback, useState } from "react";

import { Card, Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, LoadingPane, Toggle } from "@/components/primitives";

import { SourceBadge } from "./SourceBadge";
import { TrackBadge } from "./TrackBadge";
import {
  useCharacterSceneSettings,
  useRemoveCharacterSceneOverride,
  useToggleCharacterSceneSetting,
} from "./hooks/use-character-scene-settings";
import { useExpandedSettings } from "./hooks/use-expanded-settings";
import type { ExpandedSceneSetting } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface CharacterSceneOverridesProps {
  characterId: number;
}

/* --------------------------------------------------------------------------
   Setting row
   -------------------------------------------------------------------------- */

interface SettingRowProps {
  row: ExpandedSceneSetting;
  onToggle: (sceneTypeId: number, enabled: boolean) => void;
  onReset: (sceneTypeId: number) => void;
  isPending: boolean;
}

function SettingRow({ row, onToggle, onReset, isPending }: SettingRowProps) {
  const isCharacterOverride = row.source === "character";

  return (
    <tr className="border-b border-[var(--color-border-default)]">
      {/* Scene name — only shown on first row of each scene_type group */}
      <td className="px-4 py-3">
        {row.isFirstInGroup ? (
          <span className="text-sm font-medium text-[var(--color-text-primary)]">{row.name}</span>
        ) : (
          <span />
        )}
      </td>

      {/* Track badge */}
      <td className="px-4 py-3">
        {row.track_slug ? (
          <TrackBadge name={row.track_name ?? ""} slug={row.track_slug} />
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">-</span>
        )}
      </td>

      {/* Toggle — toggles entire scene_type */}
      <td className="px-4 py-3">
        <Toggle
          checked={row.is_enabled}
          onChange={(checked) => onToggle(row.scene_type_id, checked)}
          size="sm"
          disabled={isPending}
        />
      </td>

      {/* Source badge */}
      <td className="px-4 py-3">
        <SourceBadge source={row.source} />
      </td>

      {/* Reset — only on first row of character overrides */}
      <td className="px-4 py-3">
        {isCharacterOverride && row.isFirstInGroup && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReset(row.scene_type_id)}
            disabled={isPending}
          >
            Reset
          </Button>
        )}
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function CharacterSceneOverrides({ characterId }: CharacterSceneOverridesProps) {
  const { data: settings, isLoading: settingsLoading } = useCharacterSceneSettings(characterId);
  const { expandedRows, catalogLoading } = useExpandedSettings(settings);
  const toggleMutation = useToggleCharacterSceneSetting(characterId);
  const removeMutation = useRemoveCharacterSceneOverride(characterId);

  const [showResetAll, setShowResetAll] = useState(false);

  const hasCharacterOverrides = settings?.some((s) => s.source === "character");

  const handleToggle = useCallback(
    (sceneTypeId: number, enabled: boolean) => {
      toggleMutation.mutate({
        scene_type_id: sceneTypeId,
        is_enabled: enabled,
      });
    },
    [toggleMutation],
  );

  const handleReset = useCallback(
    (sceneTypeId: number) => {
      removeMutation.mutate(sceneTypeId);
    },
    [removeMutation],
  );

  const handleResetAll = useCallback(() => {
    if (!settings) return;

    const overrides = settings.filter((s) => s.source === "character");

    // Remove each character override
    for (const override of overrides) {
      removeMutation.mutate(override.scene_type_id);
    }
    setShowResetAll(false);
  }, [settings, removeMutation]);

  if (settingsLoading || catalogLoading) {
    return <LoadingPane />;
  }

  return (
    <Stack gap={4}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            Scene Settings
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Override scene settings for this character. Inherits from project and catalog defaults.
          </p>
        </div>
        {hasCharacterOverrides && (
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
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {expandedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                  >
                    No scene settings available.
                  </td>
                </tr>
              ) : (
                expandedRows.map((row) => (
                  <SettingRow
                    key={`${row.scene_type_id}-${row.track_id ?? "none"}`}
                    row={row}
                    onToggle={handleToggle}
                    onReset={handleReset}
                    isPending={toggleMutation.isPending || removeMutation.isPending}
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
        title="Reset All Character Overrides"
        size="sm"
      >
        <Stack gap={4}>
          <p className="text-sm text-[var(--color-text-secondary)]">
            This will remove all character-level scene setting overrides. Settings will fall back to
            project and catalog defaults.
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
