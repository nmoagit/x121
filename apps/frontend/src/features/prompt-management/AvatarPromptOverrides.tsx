/**
 * Avatar-level prompt overrides for both scene types and image types.
 */

import { useCallback, useMemo, useState } from "react";

import { Stack } from "@/components/layout";
import { ChevronDown, ChevronRight } from "@/tokens/icons";

import { useAvatarImageSettings } from "@/features/image-catalogue/hooks/use-avatar-image-settings";
import { useAvatarSceneSettings } from "@/features/scene-catalogue/hooks/use-avatar-scene-settings";

import { ImagePromptOverrides } from "./ImagePromptOverrides";
import {
  useAvatarSceneOverrides,
  useUpsertAvatarSceneOverrides,
} from "./hooks/use-prompt-management";
import { WorkflowPromptOverridePanel } from "./WorkflowPromptOverridePanel";
import type { SlotOverride } from "./types";
import { TYPO_DATA } from "@/lib/typography-tokens";

interface AvatarPromptOverridesProps {
  avatarId: number;
}

function SectionHeader({ title, collapsed, onToggle }: { title: string; collapsed: boolean; onToggle: () => void }) {
  const Icon = collapsed ? ChevronRight : ChevronDown;
  return (
    <button type="button" className="flex items-center gap-2 py-1.5 mb-1 w-full text-left group" onClick={onToggle}>
      <Icon size={14} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors" />
      <span className={`${TYPO_DATA} font-medium text-[var(--color-text-primary)] uppercase tracking-wide`}>{title}</span>
    </button>
  );
}

export function AvatarPromptOverrides({ avatarId }: AvatarPromptOverridesProps) {
  const { data: sceneSettings, isLoading: settingsLoading } = useAvatarSceneSettings(avatarId);
  const { data: imageSettings, isLoading: imageSettingsLoading } = useAvatarImageSettings(avatarId);
  const upsert = useUpsertAvatarSceneOverrides();
  const [imageCollapsed, setImageCollapsed] = useState(false);
  const [sceneCollapsed, setSceneCollapsed] = useState(false);

  const useOverrides = (sceneTypeId: number) =>
    useAvatarSceneOverrides(avatarId, sceneTypeId);

  const handleSave = useCallback(
    (sceneTypeId: number, overrides: SlotOverride[]) => {
      upsert.mutate({ avatarId, sceneTypeId, overrides });
    },
    [avatarId, upsert],
  );

  const enabledImageTypeIds = useMemo(() => {
    const ids = new Set<number>();
    for (const s of imageSettings ?? []) {
      if (s.is_enabled) ids.add(s.image_type_id);
    }
    return ids;
  }, [imageSettings]);

  return (
    <Stack gap={4}>
      <div>
        <SectionHeader title="Image Types" collapsed={imageCollapsed} onToggle={() => setImageCollapsed((p) => !p)} />
        {!imageCollapsed && (
          <ImagePromptOverrides enabledImageTypeIds={enabledImageTypeIds} isLoading={imageSettingsLoading} />
        )}
      </div>

      <div>
        <SectionHeader title="Scene Types" collapsed={sceneCollapsed} onToggle={() => setSceneCollapsed((p) => !p)} />
        {!sceneCollapsed && (
          <WorkflowPromptOverridePanel
            settings={sceneSettings}
            settingsLoading={settingsLoading}
            useOverrides={useOverrides}
            onSave={handleSave}
            isSaving={upsert.isPending}
          />
        )}
      </div>
    </Stack>
  );
}
