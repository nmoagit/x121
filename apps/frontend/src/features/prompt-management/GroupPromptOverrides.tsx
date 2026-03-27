/**
 * Group-level prompt overrides for both scene types and image types.
 */

import { useCallback, useMemo, useState } from "react";

import { Stack } from "@/components/layout";
import { ChevronDown, ChevronRight } from "@/tokens/icons";

import { useGroupImageSettings } from "@/features/image-catalogue/hooks/use-group-image-settings";
import { useGroupSceneSettings } from "@/features/scene-catalogue/hooks/use-group-scene-settings";

import { ImagePromptOverrides } from "./ImagePromptOverrides";
import {
  useGroupPromptOverrides,
  useUpsertGroupPromptOverrides,
} from "./hooks/use-prompt-management";
import { WorkflowPromptOverridePanel } from "./WorkflowPromptOverridePanel";
import type { SlotOverride } from "./types";

interface GroupPromptOverridesProps {
  projectId: number;
  groupId: number;
}

function SectionHeader({ title, collapsed, onToggle }: { title: string; collapsed: boolean; onToggle: () => void }) {
  const Icon = collapsed ? ChevronRight : ChevronDown;
  return (
    <button type="button" className="flex items-center gap-2 py-1.5 mb-1 w-full text-left group" onClick={onToggle}>
      <Icon size={14} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors" />
      <span className="font-mono text-xs font-medium text-[var(--color-text-primary)] uppercase tracking-wide">{title}</span>
    </button>
  );
}

export function GroupPromptOverrides({ projectId, groupId }: GroupPromptOverridesProps) {
  const { data: sceneSettings, isLoading: settingsLoading } = useGroupSceneSettings(projectId, groupId);
  const { data: imageSettings, isLoading: imageSettingsLoading } = useGroupImageSettings(projectId, groupId);
  const upsert = useUpsertGroupPromptOverrides();
  const [imageCollapsed, setImageCollapsed] = useState(false);
  const [sceneCollapsed, setSceneCollapsed] = useState(false);

  const useOverrides = (sceneTypeId: number) =>
    useGroupPromptOverrides(projectId, groupId, sceneTypeId);

  const handleSave = useCallback(
    (sceneTypeId: number, overrides: SlotOverride[]) => {
      upsert.mutate({ projectId, groupId, sceneTypeId, overrides });
    },
    [projectId, groupId, upsert],
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
