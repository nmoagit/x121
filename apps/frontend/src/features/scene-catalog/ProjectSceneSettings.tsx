/**
 * Project-level scene settings panel (PRD-111).
 *
 * Shows effective scene settings for a project with toggle switches
 * and source badges (catalog_default / project_override).
 */

import { useCallback } from "react";

import { Card } from "@/components/composite/Card";
import { Stack } from "@/components/layout";
import { Spinner, Toggle } from "@/components/primitives";

import {
  useProjectSceneSettings,
  useToggleProjectSceneSetting,
} from "./hooks/use-project-scene-settings";
import { SourceBadge } from "./SourceBadge";
import type { EffectiveSceneSetting } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ProjectSceneSettingsProps {
  projectId: number;
}

/* --------------------------------------------------------------------------
   Setting row
   -------------------------------------------------------------------------- */

interface SettingRowProps {
  setting: EffectiveSceneSetting;
  onToggle: (sceneCatalogId: number, enabled: boolean) => void;
  isPending: boolean;
}

function SettingRow({ setting, onToggle, isPending }: SettingRowProps) {
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
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ProjectSceneSettings({ projectId }: ProjectSceneSettingsProps) {
  const { data: settings, isLoading } = useProjectSceneSettings(projectId);
  const toggleMutation = useToggleProjectSceneSetting(projectId);

  const handleToggle = useCallback(
    (sceneCatalogId: number, enabled: boolean) => {
      toggleMutation.mutate({
        scene_catalog_id: sceneCatalogId,
        is_enabled: enabled,
      });
    },
    [toggleMutation],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Stack gap={4}>
      <div>
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
          Scene Settings
        </h3>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Enable or disable scenes for this project. Overrides will be marked as "project_override".
        </p>
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
              </tr>
            </thead>
            <tbody>
              {!settings || settings.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                  >
                    No scene settings available. Add scenes to the catalog first.
                  </td>
                </tr>
              ) : (
                settings.map((setting) => (
                  <SettingRow
                    key={setting.scene_catalog_id}
                    setting={setting}
                    onToggle={handleToggle}
                    isPending={toggleMutation.isPending}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Stack>
  );
}
