/**
 * Avatar-level video settings editor.
 *
 * Shows only scene types enabled for this avatar in a table with inline
 * override fields. Inherited values from scene type defaults are shown
 * as placeholders.
 */

import { useCallback, useMemo, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAvatarSceneSettings } from "@/features/scene-catalogue/hooks/use-avatar-scene-settings";

import { videoSettingsKeys, useAvatarVideoSettingsList } from "./hooks/use-video-settings";
import type { VideoSettingsOverride } from "./types";
import { VideoSettingsOverrideTable } from "./VideoSettingsOverrideTable";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface AvatarVideoSettingsProps {
  avatarId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AvatarVideoSettings({ avatarId }: AvatarVideoSettingsProps) {
  const queryClient = useQueryClient();
  const { data: list, isLoading } = useAvatarVideoSettingsList(avatarId);
  const { data: sceneSettings, isLoading: settingsLoading } = useAvatarSceneSettings(avatarId);
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());

  const overrides = useMemo(() => {
    const map: Record<number, VideoSettingsOverride> = {};
    for (const item of list ?? []) {
      map[item.scene_type_id] = {
        target_duration_secs: item.target_duration_secs,
        target_fps: item.target_fps,
        target_resolution: item.target_resolution,
      };
    }
    return map;
  }, [list]);

  // Build set of enabled scene type IDs from avatar scene settings.
  const enabledSceneTypeIds = useMemo(() => {
    const enabled = (sceneSettings ?? []).filter((s) => s.is_enabled);
    return new Set(enabled.map((s) => s.scene_type_id));
  }, [sceneSettings]);

  const handleSave = useCallback(
    async (sceneTypeId: number, values: VideoSettingsOverride) => {
      setSavingIds((prev) => new Set(prev).add(sceneTypeId));
      try {
        await api.put(`/avatars/${avatarId}/video-settings/${sceneTypeId}`, values);
        queryClient.invalidateQueries({ queryKey: videoSettingsKeys.all });
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(sceneTypeId);
          return next;
        });
      }
    },
    [avatarId, queryClient],
  );

  const handleDelete = useCallback(
    async (sceneTypeId: number) => {
      await api.delete(`/avatars/${avatarId}/video-settings/${sceneTypeId}`);
      queryClient.invalidateQueries({ queryKey: videoSettingsKeys.all });
    },
    [avatarId, queryClient],
  );

  return (
    <VideoSettingsOverrideTable
      overrides={overrides}
      isLoading={isLoading || settingsLoading}
      onSave={handleSave}
      onDelete={handleDelete}
      savingIds={savingIds}
      enabledSceneTypeIds={enabledSceneTypeIds}
    />
  );
}
