/**
 * Character-level scene setting overrides panel (PRD-111).
 *
 * Shows the three-level merged scene settings for a character with
 * toggle switches, source badges, and reset actions.
 */

import { useCallback, useState } from "react";

import { Card, Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Spinner, Toggle } from "@/components/primitives";

import {
  useCharacterSceneSettings,
  useRemoveCharacterSceneOverride,
  useToggleCharacterSceneSetting,
} from "./hooks/use-character-scene-settings";
import { SourceBadge } from "./SourceBadge";
import type { EffectiveSceneSetting } from "./types";

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
  setting: EffectiveSceneSetting;
  onToggle: (sceneCatalogId: number, enabled: boolean) => void;
  onReset: (sceneCatalogId: number) => void;
  isPending: boolean;
}

function SettingRow({ setting, onToggle, onReset, isPending }: SettingRowProps) {
  const isCharacterOverride = setting.source === "character_override";

  return (
    <tr className="border-b border-[var(--color-border-default)]">
      <td className="px-4 py-3">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {setting.name}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-[var(--color-text-muted)]">
        {setting.slug}
      </td>
      <td className="px-4 py-3">
        <Toggle
          checked={setting.is_enabled}
          onChange={(checked) => onToggle(setting.scene_catalog_id, checked)}
          size="sm"
          disabled={isPending}
        />
      </td>
      <td className="px-4 py-3">
        <SourceBadge source={setting.source} />
      </td>
      <td className="px-4 py-3">
        {isCharacterOverride && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReset(setting.scene_catalog_id)}
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

export function CharacterSceneOverrides({
  characterId,
}: CharacterSceneOverridesProps) {
  const { data: settings, isLoading } =
    useCharacterSceneSettings(characterId);
  const toggleMutation = useToggleCharacterSceneSetting(characterId);
  const removeMutation = useRemoveCharacterSceneOverride(characterId);

  const [showResetAll, setShowResetAll] = useState(false);

  const hasCharacterOverrides = settings?.some(
    (s) => s.source === "character_override",
  );

  const handleToggle = useCallback(
    (sceneCatalogId: number, enabled: boolean) => {
      toggleMutation.mutate({
        scene_catalog_id: sceneCatalogId,
        is_enabled: enabled,
      });
    },
    [toggleMutation],
  );

  const handleReset = useCallback(
    (sceneCatalogId: number) => {
      removeMutation.mutate(sceneCatalogId);
    },
    [removeMutation],
  );

  const handleResetAll = useCallback(() => {
    if (!settings) return;

    const overrides = settings.filter(
      (s) => s.source === "character_override",
    );

    // Remove each character override
    for (const override of overrides) {
      removeMutation.mutate(override.scene_catalog_id);
    }
    setShowResetAll(false);
  }, [settings, removeMutation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowResetAll(true)}
          >
            Reset All Overrides
          </Button>
        )}
      </div>

      <Card elevation="sm" padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Scene</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Slug</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Enabled</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Source</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!settings || settings.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                  >
                    No scene settings available.
                  </td>
                </tr>
              ) : (
                settings.map((setting) => (
                  <SettingRow
                    key={setting.scene_catalog_id}
                    setting={setting}
                    onToggle={handleToggle}
                    onReset={handleReset}
                    isPending={
                      toggleMutation.isPending || removeMutation.isPending
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
        title="Reset All Character Overrides"
        size="sm"
      >
        <Stack gap={4}>
          <p className="text-sm text-[var(--color-text-secondary)]">
            This will remove all character-level scene setting overrides.
            Settings will fall back to project and catalog defaults.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowResetAll(false)}
            >
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
